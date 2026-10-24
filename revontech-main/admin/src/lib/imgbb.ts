/**
 * Helper to upload images to ImgBB
 */
export const uploadToImgBB = async (file: File) => {
  const apiKey = "5b388d098a546e1a9c8f9b160d9384a5";
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    
    if (data.success) {
      return data.data.url;
    } else {
      throw new Error(data.error?.message || 'ImgBB upload failed');
    }
  } catch (error) {
    console.error("ImgBB Upload Error:", error);
    throw error;
  }
};
