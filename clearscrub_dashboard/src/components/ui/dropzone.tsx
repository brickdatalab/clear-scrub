import React from 'react';
import { useDropzone, Accept } from 'react-dropzone';
import { Upload } from 'lucide-react';

interface DropzoneProps {
  onFilesAdded: (files: File[]) => void;
  disabled?: boolean;
  accept?: Accept;
  maxFiles?: number;
  maxSize?: number;
  'aria-label'?: string;
}

export function Dropzone({
  onFilesAdded,
  disabled = false,
  accept,
  maxFiles,
  maxSize,
  'aria-label': ariaLabel,
}: DropzoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFilesAdded,
    disabled,
    accept,
    maxFiles,
    maxSize,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-8
        transition-colors cursor-pointer
        ${isDragActive ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary/50'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      aria-label={ariaLabel}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center gap-3 text-center">
        <Upload className={`h-10 w-10 ${isDragActive ? 'text-primary' : 'text-slate-400'}`} />
        <div>
          <p className="text-sm font-medium text-slate-700">
            {isDragActive ? 'Drop files here' : 'Drag and drop files here'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            or click to select files
          </p>
        </div>
        {maxSize && (
          <p className="text-xs text-slate-400">
            Max file size: {Math.round(maxSize / 1024 / 1024)}MB
          </p>
        )}
      </div>
    </div>
  );
}
