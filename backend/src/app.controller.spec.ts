import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  it('returns API status', () => {
    const controller = new AppController(new AppService());

    expect(controller.getStatus()).toEqual({
      service: 'lucky-six-api',
      status: 'ok',
    });
  });
});
