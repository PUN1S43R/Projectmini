import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, Download, Trash2, CheckCircle, 
  AlertCircle, Loader2, FileUp, History, Settings,
  FileCode, ChevronRight, Info, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DocumentRecord {
  id: string;
  file_name: string;
  original_file: string;
  converted_docx: string;
  converted_pdf: string;
  created_at: string;
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch('/api/documents?_v=' + Date.now());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setDocuments(data);
    } catch (err: any) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('WARNING: This will permanently delete ALL documents and history. Are you sure?')) return;
    
    setIsResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/documents/reset', {
        method: 'DELETE',
      });
      const data = await response.json();
      
      if (response.ok) {
        setSuccess('All records and files cleared successfully.');
        setDocuments([]);
      } else {
        throw new Error(data.error || 'Reset failed');
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      setError(err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleUpload = async () => {
    if (activeTab === 'file' && !docFile) {
      setError('Please select a document to convert.');
      return;
    }
    if (activeTab === 'text' && !rawText.trim()) {
      setError('Please enter some text to convert.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      let response;
      if (activeTab === 'file') {
        const formData = new FormData();
        formData.append('document', docFile!);
        if (referenceFile) {
          formData.append('reference', referenceFile);
        }
        response = await fetch('/api/convert', {
          method: 'POST',
          body: formData,
        });
      } else {
        response = await fetch('/api/convert-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: rawText }),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Conversion failed');
      }

      setSuccess('Document processed and formatted successfully.');
      setDocFile(null);
      setReferenceFile(null);
      setRawText('');
      fetchDocuments();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document from history?')) return;

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error('Failed to delete document', err);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      // Handle SQLite format (YYYY-MM-DD HH:MM:SS) by converting to ISO
      const isoString = dateString.includes(' ') && !dateString.includes('T') 
        ? dateString.replace(' ', 'T') + 'Z' 
        : dateString;
        
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return dateString;
      
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (err) {
      console.error('Date formatting error:', err);
      return dateString;
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans">
      {/* Top Navigation / Dashboard Header */}
      <nav className="border-b border-[#141414] bg-[#E4E3E0] sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-[#141414] flex items-center justify-center">
              <FileCode className="text-[#E4E3E0] w-5 h-5" />
            </div>
            <span className="font-mono text-sm font-bold tracking-tighter uppercase">DocFormat.v1</span>
          </div>
          
          <div className="flex items-center gap-8 font-mono text-[11px] uppercase tracking-widest opacity-60">
            <div className="hidden sm:block">A4 Standard / Arial-11 / 1.0 Spacing</div>
          </div>
        </div>
      </nav>

      <main className="max-w-[1400px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Upload & Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#E4E3E0] border border-[#141414] p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#141414] pb-4">
              <h2 className="font-serif italic text-xl">Upload Terminal</h2>
              <Info className="w-4 h-4 opacity-40" />
            </div>

            <div className="space-y-4">
              {/* Tab Switcher */}
              <div className="flex border border-[#141414]">
                <button 
                  onClick={() => setActiveTab('file')}
                  className={`flex-1 py-2 font-mono text-[10px] uppercase tracking-widest transition-all ${activeTab === 'file' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
                >
                  File Upload
                </button>
                <button 
                  onClick={() => setActiveTab('text')}
                  className={`flex-1 py-2 font-mono text-[10px] uppercase tracking-widest transition-all ${activeTab === 'text' ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
                >
                  Paste Text
                </button>
              </div>

              {activeTab === 'file' ? (
                <>
                  {/* Reference Input */}
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-widest opacity-50 block">01. Reference PDF (Optional)</label>
                    <div 
                      onClick={() => refInputRef.current?.click()}
                      className={`border border-[#141414] p-4 cursor-pointer transition-all flex items-center gap-3 ${
                        referenceFile ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'
                      }`}
                    >
                      <input type="file" ref={refInputRef} className="hidden" accept=".pdf" onChange={(e) => setReferenceFile(e.target.files?.[0] || null)} />
                      <FileUp className="w-5 h-5" />
                      <span className="font-mono text-xs truncate">{referenceFile ? referenceFile.name : 'Select Reference...'}</span>
                    </div>
                  </div>

                  {/* Main Document Input */}
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-widest opacity-50 block">02. Source Document (Required)</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`border border-[#141414] p-4 cursor-pointer transition-all flex items-center gap-3 ${
                        docFile ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'
                      }`}
                    >
                      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
                      <Upload className="w-5 h-5" />
                      <span className="font-mono text-xs truncate">{docFile ? docFile.name : 'Select PDF/DOCX/JPG/PNG...'}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase tracking-widest opacity-50 block">01. Raw Text Content</label>
                  <textarea 
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste your questions and answers here..."
                    className="w-full h-40 bg-transparent border border-[#141414] p-4 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#141414] resize-none"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleUpload}
              disabled={isUploading || (activeTab === 'file' ? !docFile : !rawText.trim())}
              className={`w-full py-4 font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 border border-[#141414] ${
                isUploading || (activeTab === 'file' ? !docFile : !rawText.trim())
                ? 'opacity-30 cursor-not-allowed' 
                : 'bg-[#141414] text-[#E4E3E0] hover:invert active:scale-[0.98]'
              }`}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Execute Conversion'
              )}
            </button>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 border border-red-500 text-red-600 font-mono text-[10px] flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" /> {error}
                </motion.div>
              )}
              {success && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 border border-emerald-600 text-emerald-700 font-mono text-[10px] flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" /> {success}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Formatting Specs */}
          <div className="bg-[#E4E3E0] border border-[#141414] p-6">
            <h3 className="font-serif italic text-lg border-b border-[#141414] pb-4 mb-4">Standardization Rules</h3>
            <div className="space-y-3">
              {[
                ['Format', 'A4 Standard'],
                ['Margins', '1.0 cm (All Sides)'],
                ['Typeface', 'Arial / Helvetica'],
                ['Size', '11 pt'],
                ['Spacing', '1.0 Line Height'],
                ['Alignment', 'Justified'],
                ['Cleanup', 'Strip Styles & Colors']
              ].map(([key, val], i) => (
                <div key={i} className="flex justify-between items-center font-mono text-[10px] uppercase tracking-wider">
                  <span className="opacity-50">{key}</span>
                  <span className="font-bold">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Right Column: History & Data */}
        <div className="lg:col-span-8">
          <div className="bg-[#E4E3E0] border border-[#141414] h-full flex flex-col">
            <div className="p-6 border-b border-[#141414] flex items-center justify-between bg-[#141414]/5">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5" />
                <h2 className="font-serif italic text-xl">Processing History</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={fetchDocuments}
                    className="p-1 hover:bg-[#141414]/10 rounded-full transition-colors"
                    title="Refresh History"
                  >
                    <Loader2 className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  </button>
                  <button 
                    onClick={handleReset}
                    disabled={documents.length === 0 || isResetting}
                    className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 border border-red-500/30 text-red-600 hover:bg-red-500 hover:text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isResetting ? <Loader2 className="w-2 h-2 animate-spin" /> : null}
                    Reset DB
                  </button>
                </div>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                Total Records: {documents.length}
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#141414] font-mono text-[10px] uppercase tracking-widest opacity-50 text-left">
                    <th className="p-4 font-normal">01. File Identity</th>
                    <th className="p-4 font-normal">02. Timestamp</th>
                    <th className="p-4 font-normal text-center">03. Output Assets</th>
                    <th className="p-4 font-normal text-right">04. Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/10">
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-12 text-center font-serif italic opacity-40">
                        No records found in current session.
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => (
                      <tr key={doc.id} className="group hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                            <span className="font-mono text-xs font-bold truncate max-w-[240px]">{doc.file_name}</span>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-[10px] uppercase opacity-60 group-hover:opacity-100">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <a 
                              href={`/media/converted/${doc.converted_pdf}`} 
                              download 
                              className="px-3 py-1 border border-[#141414] group-hover:border-[#E4E3E0] font-mono text-[9px] uppercase tracking-widest hover:bg-[#E4E3E0] hover:text-[#141414] transition-all"
                            >
                              PDF
                            </a>
                            <a 
                              href={`/media/converted/${doc.converted_docx}`} 
                              download 
                              className="px-3 py-1 border border-[#141414] group-hover:border-[#E4E3E0] font-mono text-[9px] uppercase tracking-widest hover:bg-[#E4E3E0] hover:text-[#141414] transition-all"
                            >
                              DOCX
                            </a>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => handleDelete(doc.id)}
                            className="p-2 opacity-30 hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-[#141414] bg-[#141414] text-[#E4E3E0] flex justify-between items-center font-mono text-[10px] uppercase tracking-widest">
              <span>System Status: Operational</span>
              <div className="flex items-center gap-3">
                <span className="opacity-70">Developed by</span>
                <a 
                  href="https://www.instagram.com/2minutescheating?igsh=cXVmdGUwZGhqdHc3" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-bold hover:text-emerald-400 transition-colors flex items-center gap-1 bg-[#E4E3E0] text-[#141414] px-2 py-1"
                >
                  2minutescheating <ExternalLink className="w-2 h-2" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
