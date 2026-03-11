import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import Database from "better-sqlite3";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
let pdfParse = require("pdf-parse");
// Handle potential ESM wrapper
if (typeof pdfParse !== 'function' && pdfParse.default) {
  pdfParse = pdfParse.default;
}
import mammoth from "mammoth";
import { Document, Packer, Paragraph, AlignmentType, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Initialize Database
const db = new Database("db.sqlite3");
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    file_name TEXT,
    original_file TEXT,
    converted_docx TEXT,
    converted_pdf TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Ensure media directories exist
const UPLOADS_DIR = path.join(process.cwd(), "media", "uploads");
const CONVERTED_DIR = path.join(process.cwd(), "media", "converted");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(CONVERTED_DIR)) fs.mkdirSync(CONVERTED_DIR, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

app.use(express.json());
app.use("/media", express.static(path.join(process.cwd(), "media")));

// API Routes
app.get("/api/documents", (req, res) => {
  const docs = db.prepare("SELECT * FROM documents ORDER BY created_at DESC").all();
  res.json(docs);
});

async function processTextToFiles(text: string, originalName: string, originalFile: string) {
  if (!text || text.trim().length === 0) {
    throw new Error("The document contains no readable text content.");
  }

  // Clean and group text into Q&A blocks
  const rawLines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const groupedContent: { question: string, answer: string }[] = [];
  let currentGroup: { question: string, answer: string } | null = null;

  for (const line of rawLines) {
    // Detect question start (e.g., "1.", "Q1:", "1)")
    const isQuestion = /^\d+[\.\)]|^Q\d+[:\.]/i.test(line);

    if (isQuestion) {
      if (currentGroup) groupedContent.push(currentGroup);
      currentGroup = { question: line, answer: "" };
    } else {
      if (currentGroup) {
        currentGroup.answer += (currentGroup.answer ? " " : "") + line;
      } else {
        currentGroup = { question: line, answer: "" };
      }
    }
  }
  if (currentGroup) groupedContent.push(currentGroup);

  // 1. Define DOCX generation task
  const generateDocx = async () => {
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: {
              width: 11906, // A4
              height: 16838,
            },
            margin: {
              top: 567, // 1cm
              right: 567,
              bottom: 567,
              left: 567,
            },
          },
        },
        children: groupedContent.map(group => new Paragraph({
          children: [
            new TextRun({
              text: group.question + " ",
              font: "Arial",
              size: 22, // 11pt
              bold: true,
              underline: {},
            }),
            new TextRun({
              text: group.answer,
              font: "Arial",
              size: 22, // 11pt
              bold: false, // Reduced bold for answers
            }),
          ],
          alignment: AlignmentType.JUSTIFIED,
          spacing: {
            line: 240, 
            after: 220, 
          }
        })),
      }],
    });

    const docxFileName = `${uuidv4()}.docx`;
    const docxPath = path.join(CONVERTED_DIR, docxFileName);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(docxPath, buffer);
    return docxFileName;
  };

  // 2. Define PDF generation task
  const generatePdf = async () => {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const margin = 28.35; // 1cm in points
    const fontSize = 11;
    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const contentWidth = pageWidth - 2 * margin;
    const lineHeight = fontSize * 1.0; 
    const blockGap = 15; 

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin - fontSize;

    for (const group of groupedContent) {
      const qText = (group.question || "") + " ";
      const aText = group.answer || "";
      
      const qWords = qText.split(/\s+/).filter(w => w.length > 0);
      const aWords = aText.split(/\s+/).filter(w => w.length > 0);
      
      const allWords = [
        ...qWords.map(w => ({ text: w, isBold: true, isUnderlined: true })),
        ...aWords.map(w => ({ text: w, isBold: false, isUnderlined: false }))
      ].map(wordObj => {
        const font = wordObj.isBold ? helveticaBoldFont : helveticaFont;
        const sanitizedText = wordObj.text.replace(/[^\x00-\xFF]/g, '?');
        return {
          ...wordObj,
          sanitizedText,
          width: font.widthOfTextAtSize(sanitizedText, fontSize),
          font
        };
      });

      const spaceWidth = helveticaFont.widthOfTextAtSize(" ", fontSize) * 0.8;

      // Pre-calculate height of the block
      let blockLines = 0;
      let tempLineWidth = 0;
      for (const word of allWords) {
        if (tempLineWidth + word.width + spaceWidth > contentWidth && tempLineWidth > 0) {
          blockLines++;
          tempLineWidth = word.width + spaceWidth;
        } else {
          tempLineWidth += word.width + spaceWidth;
        }
      }
      if (tempLineWidth > 0) blockLines++;
      
      const blockHeight = blockLines * lineHeight + blockGap;
      
      if (y - blockHeight < margin && blockHeight < (pageHeight - 2 * margin)) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin - fontSize;
      }

      let currentLine: typeof allWords = [];
      let currentLineWidth = 0;

      for (let i = 0; i < allWords.length; i++) {
        const word = allWords[i];

        if (currentLineWidth + word.width + spaceWidth > contentWidth && currentLine.length > 0) {
          let xOffset = margin;
          const totalWordsWidth = currentLine.reduce((sum, item) => sum + item.width, 0);
          const extraSpace = contentWidth - totalWordsWidth;
          const gapCount = currentLine.length - 1;
          const spaceBetween = gapCount > 0 ? extraSpace / gapCount : 0;

          for (let j = 0; j < currentLine.length; j++) {
            const item = currentLine[j];
            page.drawText(item.sanitizedText, { x: xOffset, y, size: fontSize, font: item.font });
            
            if (item.isUnderlined) {
              page.drawLine({
                start: { x: xOffset, y: y - 1 },
                end: { x: xOffset + item.width, y: y - 1 },
                thickness: 0.8,
                color: rgb(0, 0, 0),
              });
            }
            xOffset += item.width + spaceBetween;
          }

          y -= lineHeight;
          if (y < margin + fontSize) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin - fontSize;
          }
          currentLine = [word];
          currentLineWidth = word.width;
        } else {
          currentLine.push(word);
          currentLineWidth += word.width + spaceWidth;
        }
      }

      if (currentLine.length > 0) {
        let xOffset = margin;
        for (const item of currentLine) {
          page.drawText(item.sanitizedText, { x: xOffset, y, size: fontSize, font: item.font });
          
          if (item.isUnderlined) {
            page.drawLine({
              start: { x: xOffset, y: y - 1 },
              end: { x: xOffset + item.width, y: y - 1 },
              thickness: 0.8,
              color: rgb(0, 0, 0),
            });
          }
          xOffset += item.width + spaceWidth;
        }
        y -= lineHeight + blockGap; 

        if (y < margin + fontSize) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin - fontSize;
        }
      }
    }

    const pdfFileName = `${uuidv4()}.pdf`;
    const pdfPath = path.join(CONVERTED_DIR, pdfFileName);
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);
    return pdfFileName;
  };

  // 3. Run tasks in parallel
  const [docxFileName, pdfFileName] = await Promise.all([
    generateDocx(),
    generatePdf().catch(err => {
      console.error("PDF generation failed:", err);
      return "error.pdf";
    })
  ]);

  // Save to DB
  const docId = uuidv4();
  db.prepare(`
    INSERT INTO documents (id, file_name, original_file, converted_docx, converted_pdf, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(docId, originalName, originalFile, docxFileName, pdfFileName, new Date().toISOString());

  return docId;
}

app.post("/api/convert", upload.fields([{ name: 'reference' }, { name: 'document' }]), async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files.document) {
      return res.status(400).json({ error: "No document uploaded" });
    }

    const docFile = files.document[0];
    const originalPath = docFile.path;
    const fileExt = path.extname(docFile.originalname).toLowerCase();
    
    let text = "";
    if (fileExt === ".pdf") {
      const dataBuffer = fs.readFileSync(originalPath);
      if (typeof pdfParse !== 'function') {
        throw new Error("PDF parsing library not properly initialized.");
      }
      console.log(`Parsing PDF: ${docFile.originalname} (${dataBuffer.length} bytes)`);
      const data = await pdfParse(dataBuffer);
      text = data.text;
      console.log(`Extracted ${text.length} characters from PDF`);
    } else if (fileExt === ".docx") {
      console.log(`Parsing DOCX: ${docFile.originalname}`);
      const result = await mammoth.extractRawText({ path: originalPath });
      text = result.value;
      console.log(`Extracted ${text.length} characters from DOCX`);
    } else {
      return res.status(400).json({ error: "Unsupported file format. Please upload PDF or DOCX." });
    }

    const docId = await processTextToFiles(text, docFile.originalname, docFile.filename);
    res.json({ success: true, id: docId });
  } catch (error: any) {
    console.error("Conversion error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ error: `Failed to convert document: ${error.message || 'Unknown error'}` });
  }
});

app.post("/api/convert-text", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

    const docId = await processTextToFiles(text, "Pasted Text Content", "N/A");
    res.json({ success: true, id: docId });
  } catch (error: any) {
    console.error("Text conversion error details:", {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: `Failed to convert text: ${error.message || 'Unknown error'}` });
  }
});

app.delete("/api/documents/reset", (req, res) => {
  console.log("Reset request received");
  try {
    const docs = db.prepare("SELECT * FROM documents").all() as any[];
    console.log(`Found ${docs.length} documents to clear`);
    
    // Delete all files
    docs.forEach(doc => {
      const filesToDelete = [
        { path: path.join(UPLOADS_DIR, doc.original_file), name: 'original' },
        { path: path.join(CONVERTED_DIR, doc.converted_docx), name: 'docx' },
        { path: path.join(CONVERTED_DIR, doc.converted_pdf), name: 'pdf' }
      ];

      filesToDelete.forEach(file => {
        try {
          // Skip "N/A" or empty filenames
          if (doc.original_file !== "N/A" && fs.existsSync(file.path) && fs.lstatSync(file.path).isFile()) {
            fs.unlinkSync(file.path);
          }
        } catch (fileErr) {
          console.error(`Failed to delete file ${file.path}:`, fileErr);
        }
      });
    });

    // Clear DB
    db.prepare("DELETE FROM documents").run();
    console.log("Database table 'documents' cleared");
    
    res.json({ success: true, message: "Database and media files cleared successfully" });
  } catch (error: any) {
    console.error("Reset error:", error);
    res.status(500).json({ error: `Failed to reset database: ${error.message}` });
  }
});

app.delete("/api/documents/:id", (req, res) => {
  const { id } = req.params;
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as any;
  if (doc) {
    // Delete files
    const paths = [
      path.join(UPLOADS_DIR, doc.original_file),
      path.join(CONVERTED_DIR, doc.converted_docx),
      path.join(CONVERTED_DIR, doc.converted_pdf)
    ];
    paths.forEach(p => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    db.prepare("DELETE FROM documents WHERE id = ?").run(id);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Document not found" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const clientDistPath = path.join(process.cwd(), "dist", "client");
    app.use(express.static(clientDistPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(clientDistPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
