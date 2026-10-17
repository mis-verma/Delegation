import { type Request, type Response } from "express";
import { settingsService } from "./settings.service.js";
import { updateSettingsSchema } from "./settings.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";

export const settingsController = {
    

    get : asyncHandler(async (_req : Request , res : Response) => {
        const settings = await settingsService.get()
        res.json({ success : true , data : settings})
    }),

    // Public, unauthenticated subset — just enough for the client to render the maintenance
    // takeover, and the org name/logo on the login screen, for a signed-out or non-admin visitor
    // without exposing upload limits etc.
    status : asyncHandler(async (_req : Request , res : Response) => {
        const settings = await settingsService.get()
        res.json({
            success : true,
            data : {
                maintenanceMode: settings!.maintenanceMode,
                maintenanceMessage: settings!.maintenanceMessage,
                orgName: settings!.orgName,
                logoUrl: settings!.logoUrl,
                androidAppUrl: settings!.androidAppUrl,
                iosAppUrl: settings!.iosAppUrl,
            },
        })
    }),

    update : asyncHandler(async (req : Request , res : Response) => {
        const input = updateSettingsSchema.parse(req.body)
        const settings = await settingsService.update(input, req.user!.sub)
        res.json({ success : true, data : settings})
    }),

    uploadLogo : asyncHandler(async (req : Request , res : Response) => {
        // `logoUpload` (multer) has already run as route middleware by the time we get here —
        // req.file is the saved-to-disk file, or undefined if none was sent / it was rejected by
        // the type/size filter.
        if (!req.file) throw AppError.badRequest('No image file provided');
        const url = `/uploads/logos/${req.file.filename}`;
        const settings = await settingsService.updateLogo(url, req.user!.sub);
        res.json({ success : true, data : settings });
    }),

    removeLogo : asyncHandler(async (req : Request , res : Response) => {
        const settings = await settingsService.removeLogo(req.user!.sub);
        res.json({ success : true, data : settings });
    }),
}

