/**
 * Type guards and assertion functions
 */

import type { UserModel, DadosMateria, DadosFluxogramaUser } from './user';
import type { CursoModel, MinimalCursoModel, PreRequisitoModel, CoRequisitoModel } from './curso';
import type { MateriaModel } from './materia';
import type { EquivalenciaModel } from './equivalencia';
import type { ApiResponse, ApiError } from './api';

export function isString(value: unknown): value is string {
	return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
	return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
	return isString(value) && value.trim().length > 0;
}

export function isDadosMateria(value: unknown): value is DadosMateria {
	if (!isObject(value)) return false;
	return (
		isString(value.codigoMateria) &&
		isString(value.mencao) &&
		isString(value.professor) &&
		isString(value.status)
	);
}

export function isDadosFluxogramaUser(value: unknown): value is DadosFluxogramaUser {
	if (!isObject(value)) return false;
	return (
		isString(value.nomeCurso) &&
		(value.ira === null || isNumber(value.ira)) &&
		isString(value.matricula) &&
		isNumber(value.horasIntegralizadas) &&
		isArray(value.suspensoes) &&
		isString(value.anoAtual) &&
		isString(value.matrizCurricular) &&
		isNumber(value.semestreAtual) &&
		isArray(value.dadosFluxograma)
	);
}

export function isUserModel(value: unknown): value is UserModel {
	if (!isObject(value)) return false;
	return isNumber(value.idUser) && isString(value.email) && isString(value.nomeCompleto);
}

export function hasFluxogramaData(
	user: UserModel
): user is UserModel & { dadosFluxograma: DadosFluxogramaUser } {
	return user.dadosFluxograma !== null && user.dadosFluxograma !== undefined;
}

export function hasToken(user: UserModel): user is UserModel & { token: string } {
	return isNonEmptyString(user.token);
}

export function isMateriaModel(value: unknown): value is MateriaModel {
	if (!isObject(value)) return false;
	return (
		isString(value.ementa) &&
		isNumber(value.idMateria) &&
		isString(value.nomeMateria) &&
		isString(value.codigoMateria) &&
		isNumber(value.nivel) &&
		isNumber(value.creditos)
	);
}

export function isPreRequisitoModel(value: unknown): value is PreRequisitoModel {
	if (!isObject(value)) return false;
	return (
		isNumber(value.idPreRequisito) &&
		isNumber(value.idMateria) &&
		isNumber(value.idMateriaRequisito) &&
		isString(value.codigoMateriaRequisito) &&
		isString(value.nomeMateriaRequisito)
	);
}

export function isCoRequisitoModel(value: unknown): value is CoRequisitoModel {
	if (!isObject(value)) return false;
	return (
		isNumber(value.idCoRequisito) &&
		isNumber(value.idMateria) &&
		isNumber(value.idMateriaCoRequisito) &&
		isString(value.codigoMateriaCoRequisito) &&
		isString(value.nomeMateriaCoRequisito)
	);
}

export function isCursoModel(value: unknown): value is CursoModel {
	if (!isObject(value)) return false;
	return (
		isString(value.nomeCurso) &&
		isString(value.matrizCurricular) &&
		isNumber(value.idCurso) &&
		isString(value.classificacao) &&
		isString(value.tipoCurso) &&
		isArray(value.materias) &&
		isNumber(value.semestres)
	);
}

export function isMinimalCursoModel(value: unknown): value is MinimalCursoModel {
	if (!isObject(value)) return false;
	return (
		isString(value.nomeCurso) &&
		isString(value.matrizCurricular) &&
		isNumber(value.idCurso) &&
		isString(value.tipoCurso) &&
		isString(value.classificacao)
	);
}

export function isEquivalenciaModel(value: unknown): value is EquivalenciaModel {
	if (!isObject(value)) return false;
	return (
		isNumber(value.idEquivalencia) &&
		isString(value.codigoMateriaOrigem) &&
		isString(value.nomeMateriaOrigem) &&
		isString(value.codigoMateriaEquivalente) &&
		isString(value.nomeMateriaEquivalente) &&
		isString(value.expressao)
	);
}

export function isApiError(value: unknown): value is ApiError {
	if (!isObject(value)) return false;
	return isString(value.code) && isString(value.message);
}

export function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
	if (!isObject(value)) return false;
	return isBoolean(value.success);
}

export function assertIsString(value: unknown, name = 'value'): asserts value is string {
	if (!isString(value)) {
		throw new TypeError(`Expected ${name} to be a string, got ${typeof value}`);
	}
}

export function assertIsNumber(value: unknown, name = 'value'): asserts value is number {
	if (!isNumber(value)) {
		throw new TypeError(`Expected ${name} to be a number, got ${typeof value}`);
	}
}

export function assertIsUserModel(value: unknown): asserts value is UserModel {
	if (!isUserModel(value)) {
		throw new TypeError('Expected value to be a UserModel');
	}
}

export function assertIsCursoModel(value: unknown): asserts value is CursoModel {
	if (!isCursoModel(value)) {
		throw new TypeError('Expected value to be a CursoModel');
	}
}
