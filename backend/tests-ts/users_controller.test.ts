import { UsersController } from '../src/controllers/users_controller';
import { Request, Response } from 'express';
import { SupabaseWrapper } from '../src/supabase_wrapper';
import { Utils } from '../src/utils';

// Mock do SupabaseWrapper
jest.mock('../src/supabase_wrapper', () => {
  const mockEq = jest.fn();
  const mockSelect = jest.fn(() => ({
    eq: mockEq,
  }));
  const mockSingle = jest.fn();
  const mockInsert = jest.fn(() => ({
    select: jest.fn(() => ({
      single: mockSingle,
    })),
  }));
  const mockFrom = jest.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
  }));
  const mockGet = jest.fn(() => ({
    from: mockFrom,
  }));

  return {
    SupabaseWrapper: {
      get: mockGet,
    },
  };
});

describe('UsersController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let statusSpy: jest.SpyInstance;
  let jsonSpy: jest.SpyInstance;
  let authSpy: jest.SpyInstance;
  let mockEq: jest.Mock;
  let mockInsert: jest.Mock;
  let mockSelect: jest.Mock;
  let mockSingle: jest.Mock;

  const authUser = { id: 'auth-uuid', email: 'test@example.com' };

  beforeEach(() => {
    mockRequest = { headers: {} };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    statusSpy = jest.spyOn(mockResponse, 'status');
    jsonSpy = jest.spyOn(mockResponse, 'json');
    // Todas as rotas exigem token válido; por padrão os testes simulam
    // um usuário autenticado com email test@example.com.
    authSpy = jest.spyOn(Utils, 'getAuthenticatedUser').mockResolvedValue(authUser as any);
    // Pega os mocks
    mockSelect = (SupabaseWrapper.get().from('users') as any).select;
    mockEq = (mockSelect() as any).eq;
    mockInsert = (SupabaseWrapper.get().from('users') as any).insert;
    mockSingle = (mockInsert().select() as any).single;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('register-user-with-google', () => {
    it('should return 401 if there is no authenticated user', async () => {
      authSpy.mockResolvedValueOnce(null);
      mockRequest.body = { nome_completo: 'Test User' };

      const handler = UsersController.routes["register-user-with-google"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Não autorizado" });
    });

    it('should return 400 if nome_completo is missing', async () => {
      mockRequest.body = {};

      const handler = UsersController.routes["register-user-with-google"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Nome completo é obrigatório" });
    });

    it('should return 409 if user already exists (lookup by auth_id from the token)', async () => {
      mockRequest.body = { nome_completo: 'Test User' };

      mockEq.mockResolvedValueOnce({
        data: [{ id_user: 1 }],
        error: null,
      });

      const handler = UsersController.routes["register-user-with-google"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(mockEq).toHaveBeenCalledWith('auth_id', 'auth-uuid');
      expect(mockSingle).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Usuário já cadastrado" });
    });

    it('should return 409 for a legacy row (no auth_id) with the same email', async () => {
      mockRequest.body = { nome_completo: 'Test User' };

      mockEq
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [{ id_user: 7 }], error: null });

      const handler = UsersController.routes["register-user-with-google"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(mockEq).toHaveBeenNthCalledWith(2, 'email', 'test@example.com');
      expect(mockSingle).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(409);
    });

    it('should create the user bound to the auth_id and email from the token, ignoring body email', async () => {
      mockRequest.body = { email: 'attacker@evil.com', nome_completo: 'Test User' };
      const mockUser = { id: 1, email: 'test@example.com', nome_completo: 'Test User' };

      mockEq
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });
      mockSingle.mockResolvedValueOnce({
        data: mockUser,
        error: null,
      });

      const handler = UsersController.routes["register-user-with-google"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      // Pré-mortem 27/09/2026, R22: sem auth_id a linha ficava órfã para o
      // frontend e o UNIQUE de auth_id não barrava duplicatas.
      expect(mockInsert).toHaveBeenCalledWith({
        auth_id: 'auth-uuid',
        email: 'test@example.com',
        nome_completo: 'Test User',
      });
      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockUser);
    });

    it('should return 409 when the insert loses the race (23505 unique violation)', async () => {
      mockRequest.body = { nome_completo: 'Test User' };

      mockEq
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint "users_auth_id_key"' },
      });

      const handler = UsersController.routes["register-user-with-google"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(409);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Usuário já cadastrado" });
    });

    it('should return 500 when database error occurs during user check', async () => {
      mockRequest.body = { nome_completo: 'Test User' };
      const mockError = { message: 'Database error' };

      mockEq.mockResolvedValueOnce({
        data: null,
        error: mockError,
      });

      const handler = UsersController.routes["register-user-with-google"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Erro ao buscar usuário" });
    });
  });

  describe('get-user-by-email', () => {
    it('should return 401 if there is no authenticated user', async () => {
      authSpy.mockResolvedValueOnce(null);
      mockRequest.query = { email: 'test@example.com' };

      const handler = UsersController.routes["get-user-by-email"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Não autorizado" });
    });

    it('should return 400 if email is missing', async () => {
      mockRequest.query = {};

      const handler = UsersController.routes["get-user-by-email"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Email é obrigatório" });
    });

    it('should return 403 when requesting another user\'s email (anti-IDOR)', async () => {
      mockRequest.query = { email: 'victim@example.com' };

      const handler = UsersController.routes["get-user-by-email"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(403);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Acesso negado" });
    });

    it('should return 200 with user data when requesting own profile', async () => {
      mockRequest.query = { email: 'test@example.com' };
      const mockUser = { id: 1, email: 'test@example.com', nome_completo: 'Test User' };

      mockEq.mockResolvedValueOnce({
        data: [mockUser],
        error: null,
      });

      const handler = UsersController.routes["get-user-by-email"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockUser);
    });

    it('should return 404 when user is not found', async () => {
      mockRequest.query = { email: 'test@example.com' };

      mockEq.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const handler = UsersController.routes["get-user-by-email"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Usuário não encontrado" });
    });
  });

  describe('registrar-user-with-email', () => {
    it('should return 401 if there is no authenticated user', async () => {
      authSpy.mockResolvedValueOnce(null);
      mockRequest.body = { nome_completo: 'Test User' };

      const handler = UsersController.routes["registrar-user-with-email"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Não autorizado" });
    });

    it('should return 400 if nome_completo is missing', async () => {
      mockRequest.body = {};

      const handler = UsersController.routes["registrar-user-with-email"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({ error: "Nome completo é obrigatório" });
    });

    it('should return 200 when user is created successfully', async () => {
      mockRequest.body = { nome_completo: 'Test User' };
      const mockUser = { id: 1, email: 'test@example.com', nome_completo: 'Test User' };

      mockEq
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null });
      mockSingle.mockResolvedValueOnce({
        data: mockUser,
        error: null,
      });

      const handler = UsersController.routes["registrar-user-with-email"].value;
      await handler(mockRequest as Request, mockResponse as Response);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith(mockUser);
    });
  });
});
