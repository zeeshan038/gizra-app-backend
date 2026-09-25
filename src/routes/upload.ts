import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadToCloudflare } from '../utils/cloudflare';

const uploadRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

uploadRouter.post('/', upload.single('file'), async (req: Request, res: Response) => {
    /*  #swagger.tags = ['Upload']
        #swagger.description = 'Upload a file (image or video) to Cloudflare R2'
        #swagger.consumes = ['multipart/form-data']
        #swagger.parameters['file'] = {
            in: 'formData',
            type: 'file',
            required: true,
            description: 'The file to upload'
        }
        #swagger.parameters['subfolder'] = {
            in: 'formData',
            type: 'string',
            required: false,
            description: 'Optional subfolder path e.g. vendors/abc/assets'
        }
        #swagger.responses[200] = {
            description: 'File uploaded successfully',
            schema: {
                status: true,
                msg: 'File uploaded successfully',
                url: 'https://pub-xxxx.r2.dev/assets/abc-123.png'
            }
        }
    */
    try {
        if (!req.file) {
            return res.status(400).json({ status: false, msg: 'No file uploaded' });
        }

        const subfolder = req.body.subfolder || 'assets'; 
        
        const fileUrl = await uploadToCloudflare(
            req.file.buffer, 
            req.file.mimetype, 
            req.file.originalname, 
            subfolder
        );

        return res.status(200).json({
            status: true,
            msg: 'File uploaded successfully',
            url: fileUrl
        });

    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
});

export default uploadRouter;
