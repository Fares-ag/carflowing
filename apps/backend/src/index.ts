import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createApp } from './app.js'
import { assertProductionSecrets } from './utils/productionGuards.js'
import { initObservability } from './utils/observability.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config()

assertProductionSecrets()
await initObservability('carflow-api')

const app = createApp()
const PORT = Number(process.env.PORT) || 3001

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
