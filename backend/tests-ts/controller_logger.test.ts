/// <reference types="jest" />

import { ControllerLogger, createControllerLogger } from '../src/utils/controller_logger';
import logger from '../src/logger';

// Mock do logger
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  http: jest.fn(),
  debug: jest.fn(),
}));

describe('ControllerLogger', () => {
  let controllerLogger: ControllerLogger;
  const mockController = 'TestController';
  const mockEndpoint = '/test-endpoint';

  beforeEach(() => {
    controllerLogger = new ControllerLogger(mockController, mockEndpoint);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create a ControllerLogger instance with controller and endpoint', () => {
      const logger = new ControllerLogger('UserController', '/users');
      
      expect(logger).toBeInstanceOf(ControllerLogger);
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('http');
      expect(logger).toHaveProperty('debug');
    });

    it('should handle empty strings for controller and endpoint', () => {
      const logger = new ControllerLogger('', '');
      
      expect(logger).toBeInstanceOf(ControllerLogger);
    });

    it('should handle special characters in controller and endpoint names', () => {
      const logger = new ControllerLogger('User-Controller_123', '/users/:id');
      
      expect(logger).toBeInstanceOf(ControllerLogger);
    });
  });

  describe('info method', () => {
    it('should call logger.info with formatted message', () => {
      const message = 'User created successfully';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.info(message);

      expect(logger.info).toHaveBeenCalledWith(expectedFormattedMessage);
      expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('should handle empty message', () => {
      const message = '';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.info(message);

      expect(logger.info).toHaveBeenCalledWith(expectedFormattedMessage);
    });

    it('should handle message with special characters', () => {
      const message = 'User with ID 123 created at 2024-01-01T10:00:00Z';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.info(message);

      expect(logger.info).toHaveBeenCalledWith(expectedFormattedMessage);
    });
  });

  describe('error method', () => {
    it('should call logger.error with formatted message', () => {
      const message = 'Database connection failed';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.error(message);

      expect(logger.error).toHaveBeenCalledWith(expectedFormattedMessage);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('should handle error messages with stack traces', () => {
      const message = 'Error: Cannot read property of undefined\n    at Object.<anonymous> (/path/to/file.js:10:5)';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.error(message);

      expect(logger.error).toHaveBeenCalledWith(expectedFormattedMessage);
    });
  });

  describe('warn method', () => {
    it('should call logger.warn with formatted message', () => {
      const message = 'User session expired';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.warn(message);

      expect(logger.warn).toHaveBeenCalledWith(expectedFormattedMessage);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should handle warning messages', () => {
      const message = 'Deprecated API endpoint used';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.warn(message);

      expect(logger.warn).toHaveBeenCalledWith(expectedFormattedMessage);
    });
  });

  describe('http method', () => {
    it('should call logger.http with formatted message', () => {
      const message = 'GET /api/users - 200 OK';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.http(message);

      expect(logger.http).toHaveBeenCalledWith(expectedFormattedMessage);
      expect(logger.http).toHaveBeenCalledTimes(1);
    });

    it('should handle HTTP request/response messages', () => {
      const message = 'POST /api/users - 201 Created - Response time: 150ms';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.http(message);

      expect(logger.http).toHaveBeenCalledWith(expectedFormattedMessage);
    });
  });

  describe('debug method', () => {
    it('should call logger.debug with formatted message', () => {
      const message = 'Processing user data';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.debug(message);

      expect(logger.debug).toHaveBeenCalledWith(expectedFormattedMessage);
      expect(logger.debug).toHaveBeenCalledTimes(1);
    });

    it('should handle debug messages with complex data', () => {
      const message = 'Request body: {"name": "John", "email": "john@example.com"}';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.debug(message);

      expect(logger.debug).toHaveBeenCalledWith(expectedFormattedMessage);
    });
  });

  describe('formatMessage method (private)', () => {
    it('should format message correctly with controller and endpoint', () => {
      const message = 'Test message';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      // Test through public method
      controllerLogger.info(message);

      expect(logger.info).toHaveBeenCalledWith(expectedFormattedMessage);
    });

    it('should handle messages with line breaks', () => {
      const message = 'Multi-line\nmessage\nwith breaks';
      const expectedFormattedMessage = `\b[${mockController}][${mockEndpoint}] ${message}`;

      controllerLogger.info(message);

      expect(logger.info).toHaveBeenCalledWith(expectedFormattedMessage);
    });
  });

  describe('Multiple log levels', () => {
    it('should handle multiple log calls in sequence', () => {
      controllerLogger.debug('Debug message');
      controllerLogger.info('Info message');
      controllerLogger.warn('Warning message');
      controllerLogger.error('Error message');

      expect(logger.debug).toHaveBeenCalledWith(`\b[${mockController}][${mockEndpoint}] Debug message`);
      expect(logger.info).toHaveBeenCalledWith(`\b[${mockController}][${mockEndpoint}] Info message`);
      expect(logger.warn).toHaveBeenCalledWith(`\b[${mockController}][${mockEndpoint}] Warning message`);
      expect(logger.error).toHaveBeenCalledWith(`\b[${mockController}][${mockEndpoint}] Error message`);
    });
  });
});

describe('createControllerLogger function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a ControllerLogger instance', () => {
    const controller = 'UserController';
    const endpoint = '/users';
    
    const logger = createControllerLogger(controller, endpoint);
    
    expect(logger).toBeInstanceOf(ControllerLogger);
  });

  it('should create logger with correct controller and endpoint', () => {
    const controller = 'AuthController';
    const endpoint = '/auth/login';
    
    const logger = createControllerLogger(controller, endpoint);
    
    // Test that the logger works correctly
    logger.info('Test message');
    
    expect(logger).toBeInstanceOf(ControllerLogger);
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.http).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it('should handle edge cases in createControllerLogger', () => {
    const logger1 = createControllerLogger('', '');
    const logger2 = createControllerLogger('Controller', '');
    const logger3 = createControllerLogger('', 'endpoint');
    
    expect(logger1).toBeInstanceOf(ControllerLogger);
    expect(logger2).toBeInstanceOf(ControllerLogger);
    expect(logger3).toBeInstanceOf(ControllerLogger);
  });
});

describe('Integration tests', () => {
  it('should work with different controller and endpoint combinations', () => {
    const testCases = [
      { controller: 'UserController', endpoint: '/users' },
      { controller: 'AuthController', endpoint: '/auth/login' },
      { controller: 'CourseController', endpoint: '/courses/:id' },
      { controller: 'AdminController', endpoint: '/admin/dashboard' },
    ];

    testCases.forEach(({ controller, endpoint }) => {
      const logger = new ControllerLogger(controller, endpoint);
      const message = 'Test message';
      logger.info(message);

      expect(logger).toBeInstanceOf(ControllerLogger);
    });
  });

  it('should maintain separate instances for different controllers', () => {
    const logger1 = new ControllerLogger('Controller1', '/endpoint1');
    const logger2 = new ControllerLogger('Controller2', '/endpoint2');

    logger1.info('Message from controller 1');
    logger2.info('Message from controller 2');

    expect(logger.info).toHaveBeenCalledWith('\b[Controller1][/endpoint1] Message from controller 1');
    expect(logger.info).toHaveBeenCalledWith('\b[Controller2][/endpoint2] Message from controller 2');
  });
}); 