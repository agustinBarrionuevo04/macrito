import { z } from 'zod';

/** Texto de búsqueda: recortado, de 2 a 80 caracteres. */
export const searchQuerySchema = z.string().trim().min(2).max(80);
