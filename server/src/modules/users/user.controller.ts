import type { Request , Response} from 'express'
import { userService } from './user.service.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { AppError } from '../../utils/AppError.js'
import { createUserSchema, updateUserSchema, listUsersQuerySchema, resetUserPasswordSchema, updateOwnProfileSchema, changeOwnPasswordSchema } from './user.validation.js'

// Controllers are the layer that talks directly to Express (reads the request, sends the
// response). They don't contain business logic themselves - they just call into the
// `userService`, which does the real work (talking to the database, checking rules, etc).
// This keeps the "how do I respond to HTTP" concerns separate from "what are the business rules".
export const userController = {
    // `asyncHandler` is a wrapper that catches any errors thrown inside these async functions
    // and passes them to Express's error-handling middleware, so we don't need try/catch here.
    list : asyncHandler ( async (req : Request , res : Response) => {
        // page/limit are both optional (see listUsersQuerySchema) - when neither is sent, this
        // parses to undefined/undefined and userService.list() returns the full roster, so the
        // response shape below is byte-for-byte what it always was for existing callers.
        const { page, limit } = listUsersQuerySchema.parse(req.query);
        const result = await userService.list(page, limit)
        // Respond with a consistent shape: { success, data } (plus `meta` when paginated) so the
        // frontend always knows what to expect.
        res.json({ success : true , ...result})
    }),

    // The logged-in user's own profile — separate from getOne (which takes an :id param and is
    // admin/PC-only) so any authenticated role can read and edit their own record.
    getMe : asyncHandler(async (req : Request , res : Response) => {
        const user = await userService.getById(req.user!.sub);
        res.json({ success : true , data : user})
    }),

    updateMe : asyncHandler(async (req : Request , res : Response) => {
        const input = updateOwnProfileSchema.parse(req.body);
        const user = await userService.updateOwnProfile(req.user!.sub, input);
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
        // `req.params.id` comes from the `:id` part of the route path (e.g. /users/12345 -> id = "12345").
        const user = await userService.getById(req.params.id);
        res.json({ success : true , data : user})
    }),

    presence : asyncHandler(async (req : Request , res : Response) => {
        const data = await userService.presence();
        res.json({ success : true , data })
    }),

    create : asyncHandler(async (req : Request , res : Response) => {
        // `req.body` is the JSON payload the admin sent (email, password, role, etc), validated
        // against createUserSchema before it ever reaches the service layer.
        // `req.user!.sub` is the id of the currently logged-in admin, taken from their access token.
        // The `!` tells TypeScript "trust me, req.user will be set here" because the `authenticate`
        // middleware (in the routes file) already guarantees this route only runs for logged-in users.
        // We pass the admin's id along so the service can record who performed this action (for auditing).
        const input = createUserSchema.parse(req.body);
        const user = await userService.create(input , req.user!.sub);
        // 201 = "Created" - the standard HTTP status code for successfully creating a new resource.
        res.status(201).json({ success : true , data : user})
    }),

    update : asyncHandler(async (req : Request , res : Response) => {
        // Same pattern as create: which user to update (from the URL), what fields to change
        // (from the body, validated against updateUserSchema), and who is making the change
        // (the logged-in admin's id).
        const input = updateUserSchema.parse(req.body);
        const user = await userService.update(req.params.id , input , req.user!.sub);
        res.json({ success : true , data : user})
    }),

    resetPassword : asyncHandler(async (req : Request , res : Response) => {
        // Admin/PC sets this user's password directly - see user.service.ts's resetPassword for
        // why this is a separate action from `update` (password changes are deliberately excluded
        // from the general update endpoint).
        const { password } = resetUserPasswordSchema.parse(req.body);
        await userService.resetPassword(req.params.id, password, req.user!.sub);
        res.json({ success : true , data : { reset : true } })
    }),

    uploadAvatar : asyncHandler(async (req : Request , res : Response) => {
        // `avatarUpload` (multer) has already run as route middleware by the time we get here -
        // req.file is the saved-to-disk file, or undefined if none was sent / it was rejected by
        // the type/size filter.
        if (!req.file) throw AppError.badRequest('No image file provided');
        const url = `/uploads/avatars/${req.file.filename}`;
        const user = await userService.setAvatar(req.params.id, url, req.user!.sub);
        res.json({ success : true , data : user})
    }),

    removeAvatar : asyncHandler(async (req : Request , res : Response) => {
        const user = await userService.removeAvatar(req.params.id, req.user!.sub);
        res.json({ success : true , data : user})
    }),

    remove : asyncHandler(async (req : Request , res : Response) =>{
        // Delete the user identified by the URL param, tracking who did the deleting.
        const user = await userService.remove(req.params.id, req.user!.sub);
        // We don't send back the whole deleted user - just confirm it happened and give its id,
        // since the frontend usually just needs to know "yes, that's gone" to update its list.
        res.json({ success : true , data : { deleted : true, id : user.id } })
    }),

    listAssignable : asyncHandler(async (req : Request , res : Response) => {
        // Query params come from the URL like /users/assignable?departmentId=abc123&storeId=xyz789.
        // We only accept them if they're actually strings (query params can sometimes be arrays or
        // undefined), otherwise we treat them as "not provided".
        const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
        const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
        // A checklist can target several stores at once (?storeIds=a&storeIds=b), which Express
        // parses as a string array; a single repeated value still comes through as a plain string.
        const rawStoreIds = req.query.storeIds;
        const storeIds = Array.isArray(rawStoreIds)
            ? rawStoreIds.filter((v): v is string => typeof v === 'string')
            : typeof rawStoreIds === 'string' ? [rawStoreIds] : undefined;
        // `req.user!` here is the full decoded token payload (id, role, departmentId, storeId, etc)
        // for whoever is logged in - the service needs this to figure out scoping rules (see
        // user.service.ts `listAssignable` for the department/store scoping logic for MANAGERs).
        const users = await userService.listAssignable(req.user!, departmentId, storeId, storeIds);
        res.json({ success : true, data : users})
    })
}
