import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Replace your handleFileUpload with this:
const handleFileUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file || !machine?.id) return;

  setIsUploading(true);
  setUploadStatus(null);
  setUploadMsg('');

  try {
    const fileName = file.name;
    const filePath = `${machine.id}/${Date.now()}_${fileName}`;

    // 1. Upload from Browser to Supabase (Bypasses Vercel's 4.5MB limit)
    const { error: uploadError } = await supabase.storage
      .from('machine-docs')
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw new Error(`Storage error: ${uploadError.message}`);

    // 2. Send only the tiny metadata text to Vercel
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId: machine.id, fileName, filePath }),
    });

    if (res.ok) {
      setUploadStatus('success');
      setUploadMsg(`Successfully indexed ${file.name}`);
      fetchDocs();
    } else {
      const err = await res.json();
      throw new Error(err.error || 'Database update failed');
    }

  } catch (err) {
    setUploadStatus('error');
    setUploadMsg(err.message || 'Upload error.');
  } finally {
    setIsUploading(false);
    e.target.value = '';
  }
};