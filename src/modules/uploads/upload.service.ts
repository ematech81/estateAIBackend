import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

const FOLDER = 'estateai/listings';

export interface UploadSignature {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
}

// Signing only — the image itself is never sent through our backend; the
// browser uploads directly to Cloudinary using this signature.
export function getUploadSignature(): UploadSignature {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    // Server misconfiguration, not a bad client request — 500, not 400.
    throw new ApiError(500, 'Media upload is not configured on the server yet');
  }

  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: FOLDER },
    CLOUDINARY_API_SECRET,
  );

  return {
    timestamp,
    signature,
    apiKey: CLOUDINARY_API_KEY,
    cloudName: CLOUDINARY_CLOUD_NAME,
    folder: FOLDER,
  };
}
