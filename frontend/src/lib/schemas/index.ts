/**
 * Zod validation schemas for runtime type checking
 * These schemas match the camelCase interfaces in src/lib/types/
 */

import { z } from 'zod';

// ============================================================================
// DadosMateria Schema
// ============================================================================

export const DadosMateriaSchema = z.object({
	codigoMateria: z.string(),
	mencao: z.string(),
	professor: z.string(),
	status: z.string(),
	anoPeriodo: z.string().nullable().optional(),
	frequencia: z.string().nullable().optional(),
	tipoDado: z.string().nullable().optional(),
	turma: z.string().nullable().optional()
});

export type DadosMateriaFromSchema = z.infer<typeof DadosMateriaSchema>;

// ============================================================================
// DadosFluxogramaUser Schema
// ============================================================================

export const DadosFluxogramaUserSchema = z.object({
	nomeCurso: z.string(),
	ira: z.number().nullable(),
	iraTexto: z.string().nullable().optional(),
	matricula: z.string(),
	horasIntegralizadas: z.number().default(0),
	suspensoes: z.array(z.string()).default([]),
	anoAtual: z.string().default(''),
	matrizCurricular: z.string(),
	semestreAtual: z.number().default(0),
	dadosFluxograma: z.array(z.array(DadosMateriaSchema))
});

export type DadosFluxogramaUserFromSchema = z.infer<typeof DadosFluxogramaUserSchema>;

// ============================================================================
// UserModel Schema
// ============================================================================

export const UserModelSchema = z.object({
	idUser: z.number(),
	email: z.string().email(),
	nomeCompleto: z.string(),
	dadosFluxograma: DadosFluxogramaUserSchema.nullable().optional(),
	token: z.string().nullable().optional()
});

export type UserModelFromSchema = z.infer<typeof UserModelSchema>;

// ============================================================================
// MateriaModel Schema
// ============================================================================

export const MateriaModelSchema = z.object({
	ementa: z.string(),
	idMateria: z.number(),
	nomeMateria: z.string(),
	codigoMateria: z.string(),
	nivel: z.number(),
	creditos: z.number(),
	status: z.string().nullable().optional(),
	mencao: z.string().nullable().optional(),
	professor: z.string().nullable().optional()
});

export type MateriaModelFromSchema = z.infer<typeof MateriaModelSchema>;

// ============================================================================
// PreRequisitoModel Schema
// ============================================================================

export const PreRequisitoModelSchema = z.object({
	idPreRequisito: z.number(),
	idMateria: z.number(),
	idMateriaRequisito: z.number(),
	codigoMateriaRequisito: z.string(),
	nomeMateriaRequisito: z.string()
});

export type PreRequisitoModelFromSchema = z.infer<typeof PreRequisitoModelSchema>;

// ============================================================================
// CoRequisitoModel Schema
// ============================================================================

export const CoRequisitoModelSchema = z.object({
	idCoRequisito: z.number(),
	idMateria: z.number(),
	idMateriaCoRequisito: z.number(),
	codigoMateriaCoRequisito: z.string(),
	nomeMateriaCoRequisito: z.string()
});

export type CoRequisitoModelFromSchema = z.infer<typeof CoRequisitoModelSchema>;

// ============================================================================
// EquivalenciaModel Schema
// ============================================================================

export const EquivalenciaModelSchema = z.object({
	idEquivalencia: z.number(),
	codigoMateriaOrigem: z.string(),
	nomeMateriaOrigem: z.string(),
	codigoMateriaEquivalente: z.string(),
	nomeMateriaEquivalente: z.string(),
	expressao: z.string(),
	idCurso: z.number().nullable().optional(),
	nomeCurso: z.string().nullable().optional(),
	matrizCurricular: z.string().nullable().optional(),
	curriculo: z.string().nullable().optional(),
	dataVigencia: z.string().nullable().optional(),
	fimVigencia: z.string().nullable().optional()
});

export type EquivalenciaModelFromSchema = z.infer<typeof EquivalenciaModelSchema>;

// ============================================================================
// CursoModel Schema
// ============================================================================

export const CursoModelSchema = z.object({
	nomeCurso: z.string(),
	matrizCurricular: z.string(),
	idCurso: z.number(),
	totalCreditos: z.number().nullable(),
	classificacao: z.string(),
	tipoCurso: z.string(),
	materias: z.array(MateriaModelSchema),
	semestres: z.number(),
	equivalencias: z.array(EquivalenciaModelSchema).default([]),
	preRequisitos: z.array(PreRequisitoModelSchema).default([]),
	coRequisitos: z.array(CoRequisitoModelSchema).default([])
});

export type CursoModelFromSchema = z.infer<typeof CursoModelSchema>;

// ============================================================================
// MinimalCursoModel Schema
// ============================================================================

export const MinimalCursoModelSchema = z.object({
	nomeCurso: z.string(),
	matrizCurricular: z.string(),
	idCurso: z.number(),
	creditos: z.number().nullable(),
	tipoCurso: z.string(),
	classificacao: z.string()
});

export type MinimalCursoModelFromSchema = z.infer<typeof MinimalCursoModelSchema>;

// ============================================================================
// API Response Schemas
// ============================================================================

export const ApiErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	details: z.record(z.string(), z.unknown()).optional(),
	statusCode: z.number().optional()
});

export function createApiResponseSchema<T extends z.ZodType>(dataSchema: T) {
	return z.object({
		success: z.boolean(),
		data: dataSchema.optional(),
		error: ApiErrorSchema.optional(),
		message: z.string().optional()
	});
}

// ============================================================================
// Validation Helpers
// ============================================================================

export function safeParse<T extends z.ZodType>(
	schema: T,
	data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
	const result = z.safeParse(schema, data);
	if (result.success) {
		return { success: true, data: result.data };
	}
	return { success: false, error: result.error };
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
	return z.parse(schema, data);
}

export function validateApiResponse<T extends z.ZodType>(
	schema: T,
	response: unknown
): z.infer<T> | null {
	const result = z.safeParse(schema, response);
	if (result.success) {
		return result.data;
	}
	console.error('Validation error:', result.error.issues);
	return null;
}
