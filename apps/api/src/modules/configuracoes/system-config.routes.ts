import { Router } from 'express'
import { requireAuth } from '../../shared/auth.js'
import { uploadsEnabled } from '../../shared/uploads.js'

export const systemConfigRouter = Router()
systemConfigRouter.use(requireAuth)

systemConfigRouter.get('/uploads', async (_req, res) => {
  res.json({ uploads_enabled: await uploadsEnabled() })
})
