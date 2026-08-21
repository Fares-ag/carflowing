import type { Request, Response } from 'express'
import type { ZodError, ZodSchema } from 'zod'

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'body'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}

export function parseBody<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: formatZodError(result.error) })
    return null
  }
  return result.data
}
