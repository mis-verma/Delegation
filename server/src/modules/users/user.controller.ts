import { passwordOtpService } from "../../middleware/auth/passwordOtp.service.js"
import type { Request , Response} from 'express'
import { userService } from './user.service.js'
import { userOffboardingService } from './userOffboarding.service.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { AppError } from '../../utils/AppError.js'
import { createUserSchema, updateUserSchema, listUsersQuerySchema, resetUserPasswordSchema, updateOwnProfileSchema, changeOwnPasswordSchema, offboardUserSchema, bulkUpdateUsersSchema } from './user.validation.js'
import { isAdminOrPc } from "../../utils/roles.js"
import { routeParam } from "../../utils/routeParam.js"

export const userController = {
    list : asyncHandler ( async (req : Request , res : Response) => {
        const { page, limit } = listUsersQuerySchema.parse(req.query);
        const result = await userService.list(page, limit)
        res.json({ success : true , ...result})
    }),

    getMe : asyncHandler(async (req : Request , res : Response) => {
        const user = await userService.getById(req.user!.sub);
        res.json({ success : true , data : user})
    }),

    updateMe : asyncHandler(async (req : Request , res : Response) => {
        const input = updateOwnProfileSchema.parse(req.body);
        const user = await userService.updateOwnProfile(req.user!.sub, input, req.user!.role);
        res.json({ success : true , data : user})
    }),

    changeOwnPassword : asyncHandler(async (req : Request , res : Response) => {
        const { currentPassword, newPassword } = changeOwnPasswordSchema.parse(req.body);
        await userService.changeOwnPassword(req.user!.sub, currentPassword, newPassword);
        res.json({ success : true , data : { changed : true } })
    }),

    uploadMyAvatar : asyncHandler(async (req : Request , res : Response) => {
        if (!req.file) throw AppError.badRequest('No image file provided');
        const url = `/uploads/avatars/${req.file.filename}`;
        const user = await userService.setAvatar(req.user!.sub, url, req.user!.sub);
        res.json({ success : true , data : user})
    }),

    removeMyAvatar : asyncHandler(async (req : Request , res : Response) => {
        const user = await userService.removeAvatar(req.user!.sub, req.user!.sub);
        res.json({ success : true , data : user})
    }),

    getOne : asyncHandler(async (req : Request , res : Response) => {
        const user = await userService.getById(routeParam(req, "id"));
        res.json({ success : true , data : user})
    }),

    presence : asyncHandler(async (_req : Request , res : Response) => {
        const data = await userService.presence();
        res.json({ success : true , data })
    }),

    create : asyncHandler(async (req : Request , res : Response) => {
        const input = createUserSchema.parse(req.body);
        const user = await userService.create(input , req.user!.sub);
        let setupCodeSent = false
        if (input.sendSetupCode) {
            try {
                await passwordOtpService.sendSetupCode(user.id, req.user!.sub)
                setupCodeSent = true
            } catch (err) {
                console.error("[users] Failed to send setup code:", err)
            }
        }
        res.status(201).json({ success : true , data : user, setupCodeSent })
    }),

    update : asyncHandler(async (req : Request , res : Response) => {
        const input = updateUserSchema.parse(req.body);
        const user = await userService.update(routeParam(req, "id") , input , req.user!.sub);
        res.json({ success : true , data : user})
    }),

    sendPasswordCode : asyncHandler(async (req : Request , res : Response) => {
        await passwordOtpService.sendSetupCode(routeParam(req, "id"), req.user!.sub);
        res.json({ success : true , data : { sent : true } })
    }),

    resetPassword : asyncHandler(async (req : Request , res : Response) => {
        const { password } = resetUserPasswordSchema.parse(req.body);
        await userService.resetPassword(routeParam(req, "id"), password, req.user!.sub);
        res.json({ success : true , data : { reset : true } })
    }),

    uploadAvatar : asyncHandler(async (req : Request , res : Response) => {
        if (!req.file) throw AppError.badRequest('No image file provided');
        const url = `/uploads/avatars/${req.file.filename}`;
        const user = await userService.setAvatar(routeParam(req, "id"), url, req.user!.sub);
        res.json({ success : true , data : user})
    }),

    offboardingSummary : asyncHandler(async (req : Request , res : Response) => {
        res.json({ success : true , data : await userOffboardingService.summary(routeParam(req, "id"))})
    }),

    offboard : asyncHandler(async (req : Request , res : Response) => {
        const input = offboardUserSchema.parse(req.body ?? {})
        const result = await userOffboardingService.offboard(routeParam(req, "id"), input, req.user!.sub)
        res.json({ success : true , data : result})
    }),

    removeAvatar : asyncHandler(async (req : Request , res : Response) => {
        const user = await userService.removeAvatar(routeParam(req, "id"), req.user!.sub);
        res.json({ success : true , data : user})
    }),

    remove : asyncHandler(async (req : Request , res : Response) =>{
        const user = await userService.remove(routeParam(req, "id"), req.user!.sub);
        res.json({ success : true , data : { deleted : true, id : user.id } })
    }),

    listAssignable : asyncHandler(async (req : Request , res : Response) => {
        const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
        const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
        const rawStoreIds = req.query.storeIds;
        const storeIds = Array.isArray(rawStoreIds)
            ? rawStoreIds.filter((v): v is string => typeof v === 'string')
            : typeof rawStoreIds === 'string' ? [rawStoreIds] : undefined;
        const users = await userService.listAssignable(req.user!, departmentId, storeId, storeIds);
        const canSeeEmail = isAdminOrPc(req.user!.role);
        const data = canSeeEmail ? users : users.map(({ email: _email, ...rest }) => rest);
        res.json({ success : true, data })
    }),

    bulkUpdate : asyncHandler(async (req : Request , res : Response) => {
        const input = bulkUpdateUsersSchema.parse(req.body);
        const result = await userService.bulkUpdate(input, req.user!.sub);
        res.json({ success : true , data : result })
    })
}
