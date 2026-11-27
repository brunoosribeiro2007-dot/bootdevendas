const inviteJob = require('../src/jobs/invite.job');
const publisher = require('../src/publishers/whatsapp.publisher');
const env = require('../src/config/env');

jest.mock('../src/publishers/whatsapp.publisher', () => ({
  isReady: true,
  sendImageMessage: jest.fn().mockResolvedValue(true),
  sendTextMessage: jest.fn().mockResolvedValue(true)
}));

describe('Invite Job - Share & Community Growth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    publisher.isReady = true;
    env.whatsappGroupCasa = '120363429298492381@g.us';
    env.whatsappGroupPcGamer = '120363429098602670@g.us';
    env.linkInviteCasa = 'https://chat.whatsapp.com/Ljx9pOsMFxxIBIL1omOHVM';
    env.linkInvitePcGamer = 'https://chat.whatsapp.com/HLkYPwQzkGh7xUkA13p6e4';
    env.inviteScheduleHours = '10:00,13:00,16:30,20:00';
  });

  test('buildInviteMessageCasa should include Casa invite link and engaging copy', () => {
    const msg = inviteJob.buildInviteMessageCasa();
    expect(msg).toContain('https://chat.whatsapp.com/Ljx9pOsMFxxIBIL1omOHVM');
    expect(msg).toContain('Gostando das ofertas');
    expect(msg).toContain('casa, cozinha, limpeza');
  });

  test('buildInviteMessageGamer should include Infomarket invite link and gamer copy', () => {
    const msg = inviteJob.buildInviteMessageGamer();
    expect(msg).toContain('https://chat.whatsapp.com/HLkYPwQzkGh7xUkA13p6e4');
    expect(msg).toContain('Obrigado amigo, você é um amigo!');
    expect(msg).toContain('hardware, games e periféricos');
  });

  test('sendInviteTask with force=true should send messages to both groups', async () => {
    const result = await inviteJob.sendInviteTask(true);
    expect(result.success).toBe(true);

    // Deve ter chamado sendImageMessage ou sendTextMessage para ambos os grupos
    const totalCalls = publisher.sendImageMessage.mock.calls.length + publisher.sendTextMessage.mock.calls.length;
    expect(totalCalls).toBe(2);

    // Valida os destinatários chamados
    const targetsCalled = [
      ...publisher.sendImageMessage.mock.calls.map(c => c[2]),
      ...publisher.sendTextMessage.mock.calls.map(c => c[1])
    ];

    expect(targetsCalled).toContain('120363429298492381@g.us');
    expect(targetsCalled).toContain('120363429098602670@g.us');
  });

  test('sendInviteTask should abort if WhatsApp is not ready', async () => {
    publisher.isReady = false;
    const result = await inviteJob.sendInviteTask(true);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('whatsapp_not_ready');
  });

  test('getPortoVelhoTime returns valid hour, minute, dateStr and timeStr', () => {
    const pvTime = inviteJob.getPortoVelhoTime();
    expect(typeof pvTime.hour).toBe('number');
    expect(typeof pvTime.minute).toBe('number');
    expect(pvTime.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pvTime.timeStr).toMatch(/^\d{2}:\d{2}$/);
  });
});
