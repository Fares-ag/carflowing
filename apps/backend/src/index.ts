import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { figmaRouter } from './routes/figma.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'CarFlow Backend API' })
})

// Routes
app.use('/api/figma', figmaRouter)

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`)
})

