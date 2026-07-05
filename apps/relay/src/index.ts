/**
 * Serveur relais RAP — hub WebSocket central pour connexions distantes.
 * Déployable gratuitement (Render, Fly.io, VPS, ou local).
 *
 * Usage: npm run start -w @salle/relay
 * Port: 9850 (ou env PORT)
 */
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  DEFAULT_RELAY_PORT,
  PAIRING_CODE_EXPIRY_MS,
  PING_INTERVAL_MS,
  REMOTE_STUDENT_ID_PREFIX,
  createMessage,
  type ProtocolMessage,
  type StudentInfo,
  type InputBlockMode,
  type RemoteActionType,
} from '@salle/shared';

interface ConnectedStudent {
  ws: WebSocket;
  id: string;
  studentName: string;
  hostname: string;
  connectedAt: string;
  lastSeen: string;
  isBeingViewed: boolean;
  isControlActive: boolean;
  isLocked: boolean;
  inputBlockMode: InputBlockMode;
  isBlankScreen: boolean;
}

interface TeacherClient {
  ws: WebSocket;
  authenticated: boolean;
}

interface Room {
  schoolCode: string;
  passwordHash: string | null;
  pairingCode: string;
  pairingExpiresAt: string;
  students: Map<string, ConnectedStudent>;
  teachers: Set<TeacherClient>;
  createdAt: string;
  lastTeacherAuthAt: string | null;
}

const rooms = new Map<string, Room>();

function normalizeSchoolCode(code: string): string {
  return code.trim().toUpperCase();
}

function generatePairingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function findRoomForAutoJoin(): Room | null {
  const candidates = [...rooms.values()].filter((r) =>
    [...r.teachers].some((t) => t.authenticated && t.ws.readyState === WebSocket.OPEN)
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return candidates.sort((a, b) => {
    const ta = a.lastTeacherAuthAt ? new Date(a.lastTeacherAuthAt).getTime() : 0;
    const tb = b.lastTeacherAuthAt ? new Date(b.lastTeacherAuthAt).getTime() : 0;
    return tb - ta;
  })[0];
}

function getOrCreateRoom(schoolCode: string): Room {
  const key = normalizeSchoolCode(schoolCode);
  let room = rooms.get(key);
  if (!room) {
    room = {
      schoolCode: key,
      passwordHash: null,
      pairingCode: generatePairingCode(),
      pairingExpiresAt: new Date(Date.now() + PAIRING_CODE_EXPIRY_MS).toISOString(),
      students: new Map(),
      teachers: new Set(),
      createdAt: new Date().toISOString(),
      lastTeacherAuthAt: null,
    };
    rooms.set(key, room);
    console.log(`[Relay] Nouvelle salle: ${key}`);
  }
  return room;
}

function getStudentList(room: Room): StudentInfo[] {
  return Array.from(room.students.values()).map((s) => ({
    id: s.id,
    studentName: s.studentName,
    hostname: s.hostname,
    status: s.ws.readyState === WebSocket.OPEN ? ('online' as const) : ('offline' as const),
    connectedAt: s.connectedAt,
    lastSeen: s.lastSeen,
    isBeingViewed: s.isBeingViewed,
    isControlActive: s.isControlActive,
    isLocked: s.isLocked,
    inputBlockMode: s.inputBlockMode,
    isBlankScreen: s.isBlankScreen,
    schoolCode: room.schoolCode,
    connectionSource: 'relay' as const,
  }));
}

function broadcastToTeachers(room: Room, msg: ProtocolMessage): void {
  const data = JSON.stringify(msg);
  for (const teacher of room.teachers) {
    if (teacher.authenticated && teacher.ws.readyState === WebSocket.OPEN) {
      teacher.ws.send(data);
    }
  }
}

function notifyStudentList(room: Room): void {
  const list = getStudentList(room);
  broadcastToTeachers(
    room,
    createMessage({
      type: 'student_list',
      students: list,
      totalConnected: list.filter((s) => s.status === 'online').length,
    })
  );
}

function sendToStudent(room: Room, studentId: string, msg: ProtocolMessage): boolean {
  const student = room.students.get(studentId);
  if (!student || student.ws.readyState !== WebSocket.OPEN) return false;
  student.ws.send(JSON.stringify(msg));
  return true;
}

function relayToStudents(room: Room, studentId: string, msg: ProtocolMessage): boolean {
  const targets =
    studentId === '*'
      ? Array.from(room.students.entries())
      : room.students.has(studentId)
        ? [[studentId, room.students.get(studentId)!] as const]
        : [];

  let sent = false;
  for (const [id] of targets) {
    if (sendToStudent(room, id, msg)) sent = true;
  }
  return sent;
}

function handleStudentMessage(room: Room, student: ConnectedStudent, msg: ProtocolMessage): void {
  student.lastSeen = new Date().toISOString();

  switch (msg.type) {
    case 'screen_frame':
      broadcastToTeachers(room, msg);
      break;
    case 'control_response': {
      const m = msg as { accepted: boolean };
      student.isControlActive = m.accepted;
      notifyStudentList(room);
      broadcastToTeachers(room, msg);
      break;
    }
    case 'pong':
      break;
    default:
      break;
  }
}

function handleTeacherMessage(room: Room, teacher: TeacherClient, msg: ProtocolMessage): void {
  switch (msg.type) {
    case 'auth': {
      const auth = msg as { password?: string };
      if (!auth.password) {
        teacher.ws.send(
          JSON.stringify(
            createMessage({ type: 'auth_result', success: false, error: 'Mot de passe requis' })
          )
        );
        return;
      }
      if (!room.passwordHash) {
        room.passwordHash = bcrypt.hashSync(auth.password, 10);
      }
      const success = bcrypt.compareSync(auth.password, room.passwordHash);
      teacher.authenticated = success;
      teacher.ws.send(
        JSON.stringify(
          createMessage({
            type: 'auth_result',
            success,
            error: success ? undefined : 'Mot de passe incorrect',
            sessionToken: success ? uuidv4() : undefined,
          })
        )
      );
      if (success) {
        room.lastTeacherAuthAt = new Date().toISOString();
        notifyStudentList(room);
        teacher.ws.send(
          JSON.stringify(
            createMessage({
              type: 'pairing_info',
              code: room.pairingCode,
              expiresAt: room.pairingExpiresAt,
              serverIp: 'relay',
              port: DEFAULT_RELAY_PORT,
            })
          )
        );
      }
      break;
    }
    case 'teacher_message': {
      const m = msg as { studentId: string; content: string };
      relayToStudents(room, m.studentId, createMessage({ type: 'teacher_message', ...m }));
      break;
    }
    case 'control_request': {
      const m = msg as { studentId: string };
      relayToStudents(room, m.studentId, createMessage({ type: 'control_request', ...m }));
      break;
    }
    case 'control_stop': {
      const m = msg as { studentId: string };
      const s = room.students.get(m.studentId);
      if (s) {
        s.isControlActive = false;
        relayToStudents(room, m.studentId, createMessage({ type: 'control_stop', ...m }));
        notifyStudentList(room);
      }
      break;
    }
    case 'control_input': {
      const m = msg as ProtocolMessage & { studentId: string };
      sendToStudent(room, m.studentId, msg);
      break;
    }
    case 'lock_screen':
    case 'unlock_screen': {
      const m = msg as { studentId: string };
      const targets =
        m.studentId === '*'
          ? Array.from(room.students.entries())
          : room.students.has(m.studentId)
            ? [[m.studentId, room.students.get(m.studentId)!] as const]
            : [];
      for (const [id, s] of targets) {
        if (msg.type === 'lock_screen') s.isLocked = true;
        else s.isLocked = false;
        sendToStudent(room, id, msg);
      }
      notifyStudentList(room);
      break;
    }
    case 'block_input': {
      const m = msg as { studentId: string; mode: InputBlockMode };
      const targets =
        m.studentId === '*'
          ? Array.from(room.students.entries())
          : room.students.has(m.studentId)
            ? [[m.studentId, room.students.get(m.studentId)!] as const]
            : [];
      for (const [id, s] of targets) {
        s.inputBlockMode = m.mode;
        sendToStudent(room, id, createMessage({ type: 'block_input', studentId: id, mode: m.mode }));
      }
      notifyStudentList(room);
      break;
    }
    case 'remote_action': {
      const m = msg as { studentId: string; action: RemoteActionType; payload?: string };
      const targets =
        m.studentId === '*'
          ? Array.from(room.students.entries())
          : room.students.has(m.studentId)
            ? [[m.studentId, room.students.get(m.studentId)!] as const]
            : [];
      for (const [id, s] of targets) {
        if (m.action === 'blank_screen') s.isBlankScreen = true;
        if (m.action === 'restore_screen') s.isBlankScreen = false;
        sendToStudent(
          room,
          id,
          createMessage({ type: 'remote_action', studentId: id, action: m.action, payload: m.payload })
        );
      }
      notifyStudentList(room);
      break;
    }
    case 'viewing_notice': {
      const m = msg as { studentId: string; isViewing: boolean };
      const s = room.students.get(m.studentId);
      if (s) {
        s.isBeingViewed = m.isViewing;
        sendToStudent(room, m.studentId, msg);
        notifyStudentList(room);
      }
      break;
    }
    default:
      break;
  }
}

function handleStudentAuth(
  room: Room,
  ws: WebSocket,
  msg: { studentName?: string; hostname?: string; autoJoin?: boolean; pairingCode?: string }
): ConnectedStudent | null {
  if (!msg.hostname) {
    ws.send(
      JSON.stringify(
        createMessage({ type: 'auth_result', success: false, error: 'Données manquantes' })
      )
    );
    ws.close();
    return null;
  }

  const studentName = msg.studentName?.trim() || msg.hostname;
  const studentId = `${REMOTE_STUDENT_ID_PREFIX}${uuidv4()}`;

  const connected: ConnectedStudent = {
    ws,
    id: studentId,
    studentName,
    hostname: msg.hostname,
    connectedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    isBeingViewed: false,
    isControlActive: false,
    isLocked: false,
    inputBlockMode: 'none',
    isBlankScreen: false,
  };

  room.students.set(studentId, connected);

  ws.send(
    JSON.stringify(createMessage({ type: 'auth_result', success: true, studentId }))
  );

  console.log(`[Relay] Élève connecté [${room.schoolCode}]: ${studentName} (${msg.hostname})`);
  notifyStudentList(room);
  return connected;
}

function setupConnection(ws: WebSocket): void {
  let room: Room | null = null;
  let role: 'student' | 'teacher' | null = null;
  let teacherClient: TeacherClient | null = null;
  let studentRef: ConnectedStudent | null = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ProtocolMessage;

      if (msg.type === 'auth' && !role) {
        const auth = msg as {
          role: string;
          schoolCode?: string;
          password?: string;
          studentName?: string;
          hostname?: string;
          autoJoin?: boolean;
          autoDiscover?: boolean;
          pairingCode?: string;
        };

        role = auth.role as 'student' | 'teacher';

        if (role === 'student' && (auth.autoDiscover || !auth.schoolCode)) {
          room = findRoomForAutoJoin();
          if (!room) {
            ws.send(
              JSON.stringify(
                createMessage({
                  type: 'auth_result',
                  success: false,
                  error: 'Professeur non disponible — le professeur doit être connecté',
                })
              )
            );
            ws.close();
            return;
          }
          studentRef = handleStudentAuth(room, ws, auth);
          return;
        }

        if (!auth.schoolCode) {
          ws.send(
            JSON.stringify(
              createMessage({
                type: 'auth_result',
                success: false,
                error: 'Code école requis',
              })
            )
          );
          ws.close();
          return;
        }

        room = getOrCreateRoom(auth.schoolCode);

        if (role === 'teacher') {
          teacherClient = { ws, authenticated: false };
          room.teachers.add(teacherClient);
          handleTeacherMessage(room, teacherClient, msg);
        } else if (role === 'student') {
          studentRef = handleStudentAuth(room, ws, auth);
        }
        return;
      }

      if (!room) return;

      if (role === 'teacher' && teacherClient) {
        handleTeacherMessage(room, teacherClient, msg);
      } else if (role === 'student' && studentRef) {
        handleStudentMessage(room, studentRef, msg);
      }
    } catch (err) {
      console.error('[Relay] Erreur message:', err);
    }
  });

  ws.on('close', () => {
    if (!room) return;
    if (teacherClient) {
      room.teachers.delete(teacherClient);
    }
    if (studentRef) {
      room.students.delete(studentRef.id);
      console.log(`[Relay] Élève déconnecté [${room.schoolCode}]: ${studentRef.studentName}`);
      notifyStudentList(room);
    }
    if (room.students.size === 0 && room.teachers.size === 0) {
      // Garder la salle en mémoire pour le mot de passe professeur
    }
  });

  ws.on('error', (err) => {
    console.error('[Relay] WebSocket error:', err.message);
  });
}

let relayServer: http.Server | null = null;
let relayWss: WebSocketServer | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let relayServerOwned = false;
let startingRelay: Promise<boolean> | null = null;

function isRelayReachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body) as { service?: string };
          resolve(json.service === 'RAP Relay');
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function listenRelayServer(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          service: 'RAP Relay',
          version: '1.0',
          rooms: rooms.size,
          status: 'ok',
        })
      );
    });

    const wss = new WebSocketServer({ server });
    wss.on('connection', setupConnection);
    wss.on('error', (err: Error) => {
      console.warn('[Relay] WebSocketServer error:', err.message);
    });

    const fail = (err?: NodeJS.ErrnoException) => {
      wss.close();
      server.close();
      relayServer = null;
      relayWss = null;
      relayServerOwned = false;

      if (err?.code === 'EADDRINUSE') {
        console.warn(
          `[Relay] Port ${port} déjà utilisé — relais existant supposé actif (ws://127.0.0.1:${port})`
        );
      } else if (err) {
        console.error('[Relay] Erreur démarrage:', err.message);
      }
      resolve(false);
    };

    server.on('error', fail);

    server.listen(port, '0.0.0.0', () => {
      server.removeAllListeners('error');
      server.on('error', (err: NodeJS.ErrnoException) => {
        console.error('[Relay] Erreur serveur:', err.message);
      });

      relayServer = server;
      relayWss = wss;
      relayServerOwned = true;

      pingInterval = setInterval(() => {
        for (const room of rooms.values()) {
          for (const [, student] of room.students) {
            if (student.ws.readyState === WebSocket.OPEN) {
              student.ws.send(JSON.stringify(createMessage({ type: 'ping' })));
            }
          }
          if (new Date(room.pairingExpiresAt) < new Date()) {
            room.pairingCode = generatePairingCode();
            room.pairingExpiresAt = new Date(Date.now() + PAIRING_CODE_EXPIRY_MS).toISOString();
          }
        }
      }, PING_INTERVAL_MS);

      console.log(`[Relay] RAP Relay actif sur le port ${port}`);
      console.log(`[Relay] WebSocket: ws://0.0.0.0:${port}`);
      resolve(true);
    });
  });
}

export function startRelayServer(
  port = Number(process.env.PORT) || DEFAULT_RELAY_PORT
): Promise<boolean> {
  if (relayServer && relayServerOwned) {
    return Promise.resolve(true);
  }
  if (startingRelay) {
    return startingRelay;
  }

  startingRelay = (async () => {
    if (await isRelayReachable(port)) {
      console.warn(`[Relay] Service déjà actif sur le port ${port}`);
      return false;
    }
    return listenRelayServer(port);
  })().finally(() => {
    startingRelay = null;
  });

  return startingRelay;
}

export function stopRelayServer(): void {
  if (!relayServerOwned) return;

  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  relayWss?.close();
  relayServer?.close();
  relayWss = null;
  relayServer = null;
  relayServerOwned = false;
}

export function getRelayRoomCount(): number {
  return rooms.size;
}

if (require.main === module) {
  startRelayServer();
}
