// app/import/page.tsx
'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/supabase-client';


interface UploadedFile {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  errorMessage?: string;
  previewData?: any[];
  supabaseUrl?: string;
}

interface ImportSettings {
  delimiter: string;
  hasHeaders: boolean;
  skipEmptyLines: boolean;
  dataType: string;
  description: string;
  isPublic: boolean;
}

export default function DataImportPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [importSettings, setImportSettings] = useState<ImportSettings>({
    delimiter: ',',
    hasHeaders: true,
    skipEmptyLines: true,
    dataType: '',
    description: '',
    isPublic: false
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Supported file types
  const supportedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain'
  ];

  // Data type options for tennis analytics
  const dataTypes = [
    'Match Results',
    'Player Statistics',
    'Training Data',
    'Tournament Rankings',
    'Performance Metrics',
    'Injury Reports',
    'Equipment Data',
    'Court Conditions',
    'Video Analysis',
    'Other'
  ];

  // Generate unique ID for files
  const generateFileId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Handle drop event
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      handleFiles(selectedFiles);
    }
  };

  // Process selected files
  const handleFiles = (selectedFiles: File[]) => {
    const newFiles: UploadedFile[] = selectedFiles
      .filter(file => {
        // Check file type
        if (!supportedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.csv')) {
          alert(`File type not supported: ${file.name}`);
          return false;
        }
        // Check file size (50MB limit)
        if (file.size > 50 * 1024 * 1024) {
          alert(`File too large (max 50MB): ${file.name}`);
          return false;
        }
        return true;
      })
      .map(file => ({
        file,
        id: generateFileId(),
        name: file.name,
        size: file.size,
        type: file.type || 'text/csv',
        lastModified: file.lastModified,
        status: 'pending' as const,
        progress: 0
      }));

    setFiles(prev => [...prev, ...newFiles]);

    // Auto-preview first CSV file
    if (newFiles.length > 0 && (newFiles[0].type === 'text/csv' || newFiles[0].name.endsWith('.csv'))) {
      previewFile(newFiles[0]);
    }
  };

  // Preview file data
  const previewFile = async (fileData: UploadedFile) => {
    if (!fileData.file.name.toLowerCase().endsWith('.csv')) return;

    try {
      const text = await fileData.file.text();
      const lines = text.split('\n').slice(0, 6); // Preview first 5 rows + header
      const delimiter = importSettings.delimiter;
      
      const previewData = lines
        .filter(line => line.trim())
        .map(line => {
          // Simple CSV parsing (for preview only)
          return line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, ''));
        });

      setFiles(prev => prev.map(f => 
        f.id === fileData.id 
          ? { ...f, previewData }
          : f
      ));

      setShowPreview(true);
    } catch (error) {
      console.error('Preview error:', error);
    }
  };

  // Remove file from list
  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Handle settings change
  const handleSettingsChange = (key: keyof ImportSettings, value: any) => {
    setImportSettings(prev => ({ ...prev, [key]: value }));
  };

  // Upload files to Supabase
  const uploadFiles = async () => {
    if (files.length === 0) {
      alert('Please select at least one file to upload');
      return;
    }

    if (!importSettings.dataType) {
      alert('Please select a data type');
      return;
    }

    setIsProcessing(true);

    try {
      for (const fileData of files) {
        if (fileData.status === 'success') continue;

        // Update status to uploading
        setFiles(prev => prev.map(f => 
          f.id === fileData.id 
            ? { ...f, status: 'uploading', progress: 0 }
            : f
        ));

        // Generate file path
        const filePath = `imports/${Date.now()}-${fileData.name}`;
        
        // TODO: Replace with actual Supabase upload
        // Uncomment the lines below and comment out the mock code when ready
        const { data, error } = await supabase.storage
          .from('tennis-data')
          .upload(filePath, fileData.file, {
            cacheControl: '3600',
            upsert: false,
            metadata: {
              dataType: importSettings.dataType,
              description: importSettings.description,
              hasHeaders: importSettings.hasHeaders,
              delimiter: importSettings.delimiter,
              uploadedBy: 'user-id', // Replace with actual user ID
              uploadedAt: new Date().toISOString()
            }
          });

        if (error) {
          throw new Error(error.message);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('tennis-data')
          .getPublicUrl(filePath);

        // MOCK CODE - Remove this section when using real Supabase
        // Simulate upload progress
        // for (let progress = 0; progress <= 100; progress += 10) {
        //   setFiles(prev => prev.map(f => 
        //     f.id === fileData.id 
        //       ? { ...f, progress }
        //       : f
        //   ));
        //   await new Promise(resolve => setTimeout(resolve, 100));
        // }

        // // Mock success response
        // const mockUrl = `https://pouxujkhtbvkdwbzfvka.supabase.co/storage/v1/object/public/tennis-data/${filePath}`;
        // END MOCK CODE

        // Update file status to success
        setFiles(prev => prev.map(f => 
          f.id === fileData.id 
            ? { ...f, status: 'success', progress: 100, supabaseUrl: 'https://pouxujkhtbvkdwbzfvka.supabase.co' }
            : f
        ));

        // Save metadata to database table
        // TODO: Uncomment when database table is created
        const { error: dbError } = await supabase
          .from('imported_files')
          .insert({
            file_name: fileData.name,
            file_size: fileData.size,
            file_type: fileData.type,
            storage_path: filePath, // Use filePath instead of data.path
            storage_url: 'https://pouxujkhtbvkdwbzfvka.supabase.co',   // Use actual URL: urlData.publicUrl
            data_type: importSettings.dataType,
            description: importSettings.description,
            has_headers: importSettings.hasHeaders,
            delimiter: importSettings.delimiter,
            is_public: importSettings.isPublic,
            uploaded_by: 'user-id', // Replace with actual user ID from auth
            uploaded_at: new Date().toISOString()
          });

        if (dbError) {
          console.error('Database error:', dbError);
          // File uploaded but metadata save failed - you might want to handle this
        }
      }

      alert('All files uploaded successfully!');
    } catch (error: any) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => 
        f.status === 'uploading' 
          ? { ...f, status: 'error', errorMessage: error.message || 'Upload failed' }
          : f
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get status color
  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-500 bg-gray-100';
      case 'uploading': return 'text-blue-500 bg-blue-100';
      case 'success': return 'text-green-500 bg-green-100';
      case 'error': return 'text-red-500 bg-red-100';
      default: return 'text-gray-500 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Import Data</h1>
              <p className="mt-2 text-gray-600">
                Upload CSV, Excel, or JSON files to analyze your tennis data
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              ← Back
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Area */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Upload Files</h2>
                
                {/* Drag and Drop Area */}
                <div
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive 
                      ? 'border-indigo-500 bg-indigo-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="mt-4">
                    <p className="text-sm text-gray-600">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        Click to upload
                      </button>
                      {' '}or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      CSV, Excel, JSON files up to 50MB
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".csv,.xlsx,.xls,.json,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      Selected Files ({files.length})
                    </h3>
                    <div className="space-y-3">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <div className="flex-shrink-0">
                              <svg className="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {file.name}
                              </p>
                              <p className="text-sm text-gray-500">
                                {formatFileSize(file.size)} • {file.type}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(file.status)}`}>
                              {file.status}
                            </span>
                            
                            {file.status === 'uploading' && (
                              <div className="w-20 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${file.progress}%` }}
                                ></div>
                              </div>
                            )}
                            
                            {file.status === 'success' && file.supabaseUrl && (
                              <a
                                href={file.supabaseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
                              >
                                View
                              </a>
                            )}
                            
                            {file.status !== 'uploading' && (
                              <button
                                onClick={() => removeFile(file.id)}
                                className="text-red-600 hover:text-red-500"
                              >
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                          
                          {file.errorMessage && (
                            <p className="text-sm text-red-600 mt-1">{file.errorMessage}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Preview */}
                {showPreview && files.some(f => f.previewData) && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Data Preview</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <tbody className="bg-white divide-y divide-gray-200">
                          {files.find(f => f.previewData)?.previewData?.map((row, rowIndex) => (
                            <tr key={rowIndex} className={rowIndex === 0 && importSettings.hasHeaders ? 'bg-gray-50 font-medium' : ''}>
                              {row.map((cell: string, cellIndex: number) => (
                                <td key={cellIndex} className="px-3 py-2 whitespace-nowrap text-gray-900 border-r border-gray-200">
                                  {cell || ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Showing first 5 rows • Full data will be processed on upload
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Settings Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Import Settings</h2>
                
                <div className="space-y-4">
                  {/* Data Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data Type *
                    </label>
                    <select
                      value={importSettings.dataType}
                      onChange={(e) => handleSettingsChange('dataType', e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">Select data type</option>
                      {dataTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={importSettings.description}
                      onChange={(e) => handleSettingsChange('description', e.target.value)}
                      rows={3}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Describe what this data contains..."
                    />
                  </div>

                  {/* CSV Settings */}
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">CSV Settings</h3>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Delimiter
                        </label>
                        <select
                          value={importSettings.delimiter}
                          onChange={(e) => handleSettingsChange('delimiter', e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        >
                          <option value=",">Comma (,)</option>
                          <option value=";">Semicolon (;)</option>
                          <option value="\t">Tab</option>
                          <option value="|">Pipe (|)</option>
                        </select>
                      </div>

                      <div className="flex items-center">
                        <input
                          id="hasHeaders"
                          type="checkbox"
                          checked={importSettings.hasHeaders}
                          onChange={(e) => handleSettingsChange('hasHeaders', e.target.checked)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="hasHeaders" className="ml-2 block text-sm text-gray-900">
                          First row contains headers
                        </label>
                      </div>

                      <div className="flex items-center">
                        <input
                          id="skipEmptyLines"
                          type="checkbox"
                          checked={importSettings.skipEmptyLines}
                          onChange={(e) => handleSettingsChange('skipEmptyLines', e.target.checked)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="skipEmptyLines" className="ml-2 block text-sm text-gray-900">
                          Skip empty lines
                        </label>
                      </div>

                      <div className="flex items-center">
                        <input
                          id="isPublic"
                          type="checkbox"
                          checked={importSettings.isPublic}
                          onChange={(e) => handleSettingsChange('isPublic', e.target.checked)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900">
                          Make data publicly accessible
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upload Button */}
                <div className="mt-6">
                  <button
                    onClick={uploadFiles}
                    disabled={files.length === 0 || isProcessing || !importSettings.dataType}
                    className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                      files.length === 0 || isProcessing || !importSettings.dataType
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                    }`}
                  >
                    {isProcessing ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Uploading...
                      </span>
                    ) : (
                      `Upload ${files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''}` : 'Files'}`
                    )}
                  </button>
                </div>

                {/* File Info */}
                <div className="mt-4 text-xs text-gray-500">
                  <p><strong>Supported formats:</strong> CSV, Excel (.xlsx, .xls), JSON, TXT</p>
                  <p><strong>Maximum size:</strong> 50MB per file</p>
                  <p><strong>Storage:</strong> Files are stored securely in Supabase Storage</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}