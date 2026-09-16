import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { query } from './config/database.js'
import { env } from './config/env.js'
import { adminRouter } from './modules/admin/admin.routes.js'
import { assetsRouter } from './modules/arquivos/assets.routes.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { budgetRouter } from './modules/orcamento/budget.routes.js'
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js'
import { expensesRouter } from './modules/despesas/expense.routes.js'
import { stagesRouter } from './modules/etapas/stage.routes.js'
import { invitationsRouter, membersRouter } from './modules/membros/member.routes.js'
import { paymentsRouter } from './modules/pagamentos/payment.routes.js'
import { permissionsRouter } from './modules/permissoes/permission.routes.js'
import { projectsRouter } from './modules/projetos/project.routes.js'
import { tasksRouter } from './modules/tarefas/task.routes.js'
import { errorHandler, notFoundHandler } from './shared/errors.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', false)
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }))
  app.use(cors({ origin: env.webUrl, credentials: false, methods: ['GET','POST','PUT','PATCH','DELETE'] }))
  app.use(express.json({ limit: '5mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))

  app.get('/api/saude', async (_req, res) => {
    await query('SELECT 1')
    res.json({ status: 'ok', servico: 'minhaobra-api', banco: 'ok' })
  })
  app.use('/api/auth', authRouter)
  app.use('/api/convites', invitationsRouter)
  app.use('/api/projetos', projectsRouter)
  app.use('/api/projetos/:projetoId/membros', membersRouter)
  app.use('/api/projetos/:projetoId/etapas', stagesRouter)
  app.use('/api/projetos/:projetoId/cronograma', stagesRouter)
  app.use('/api/projetos/:projetoId/orcamento', budgetRouter)
  app.use('/api/projetos/:projetoId/fluxo-caixa', budgetRouter)
  app.use('/api/projetos/:projetoId/pagamentos', paymentsRouter)
  app.use('/api/projetos/:projetoId/despesas', expensesRouter)
  app.use('/api/projetos/:projetoId/permissoes', permissionsRouter)
  app.use('/api/projetos/:projetoId/tarefas', tasksRouter)
  app.use('/api/projetos/:projetoId/acervo', assetsRouter)
  app.use('/api/projetos/:projetoId/dashboard', dashboardRouter)
  app.use('/api/admin', adminRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
