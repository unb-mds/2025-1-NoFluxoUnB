/**
 * Generic API response types
 */

export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: ApiError;
	message?: string;
}

export interface ApiError {
	code: string;
	message: string;
	details?: Record<string, unknown>;
	statusCode?: number;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		pageSize: number;
		totalItems: number;
		totalPages: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
}

export interface LoginResponse {
	user: {
		id_user: number;
		email: string;
		nome_completo: string;
		dados_users?: Array<{
			fluxograma_atual?: string | null;
		}>;
	};
	token: string;
}

export interface CursosListResponse {
	cursos: Array<{
		id_curso: number;
		nome_curso: string;
		matriz_curricular: string;
		creditos: number | null;
		tipo_curso: string;
		classificacao: string;
	}>;
}

export interface SaveFluxogramaRequest {
	id_user: number;
	optativas_manuais?: Array<{
		codigo: string;
		nivel_alocado: number;
		status: string;
		nome?: string | null;
	}>;
	fluxograma_atual: {
		nome_curso: string;
		ira: number | null;
		matricula: string;
		matriz_curricular: string;
		semestre_atual: number;
		ano_atual: string;
		horas_integralizadas: number;
		suspensoes: string[];
		dados_fluxograma: Array<
			Array<{
				codigo: string;
				mencao: string;
				professor: string;
				status: string;
				ano_periodo?: string;
				frequencia?: string;
				tipo_dado?: string;
				turma?: string;
			}>
		>;
	};
}

export function createSuccessResponse<T>(data: T, message?: string): ApiResponse<T> {
	return {
		success: true,
		data,
		message
	};
}

export function createErrorResponse(
	code: string,
	message: string,
	statusCode?: number,
	details?: Record<string, unknown>
): ApiResponse<never> {
	return {
		success: false,
		error: { code, message, statusCode, details }
	};
}

export function isSuccessResponse<T>(
	response: ApiResponse<T>
): response is ApiResponse<T> & { data: T } {
	return response.success && response.data !== undefined;
}

export function isErrorResponse<T>(
	response: ApiResponse<T>
): response is ApiResponse<T> & { error: ApiError } {
	return !response.success && response.error !== undefined;
}
