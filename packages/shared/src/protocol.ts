export type ClientRole = 'teacher' | 'student';

export type StudentStatus = 'online' | 'offline' | 'away';

export type NotificationStyle =
  | 'popup_center'
  | 'popup_corner'
  | 'banner_top'
  | 'banner_bottom'
  | 'toast'
  | 'fullscreen_alert'
  | 'system_only';

export type InputBlockMode = 'mouse' | 'keyboard' | 'both' | 'none';

export type RemoteActionType =
  | 'open_url'
  | 'blank_screen'
  | 'restore_screen'
  | 'flash_screen'
  | 'beep'
  | 'close_window'
  | 'set_clipboard'
  | 'request_attention';

export interface StudentInfo {
  id: string;
  studentName: string;
  hostname: string;
  status: StudentStatus;
  connectedAt: string;
  lastSeen: string;
  isBeingViewed?: boolean;
  isControlActive?: boolean;
  isLocked?: boolean;
  inputBlockMode?: InputBlockMode;
  isBlankScreen?: boolean;
  /** Code école / salle pour les connexions distantes */
  schoolCode?: string;
  /** lan = réseau local, relay = via serveur relais */
  connectionSource?: 'lan' | 'relay';
}

export interface ConnectionHistoryEntry {
  id: number;
  studentName: string;
  hostname: string;
  connectedAt: string;
  disconnectedAt: string | null;
  durationSeconds: number | null;
}

export interface ControlLogEntry {
  id: number;
  action: string;
  studentId: string;
  studentName: string;
  timestamp: string;
  details: string | null;
}

export type MessageType =
  | 'auth'
  | 'auth_result'
  | 'student_register'
  | 'student_list'
  | 'screen_frame'
  | 'ping'
  | 'pong'
  | 'teacher_message'
  | 'control_request'
  | 'control_response'
  | 'control_input'
  | 'control_stop'
  | 'lock_screen'
  | 'unlock_screen'
  | 'block_input'
  | 'remote_action'
  | 'viewing_notice'
  | 'student_status'
  | 'pairing_info'
  | 'error';

export interface BaseMessage {
  type: MessageType;
  timestamp?: string;
}

export interface AuthMessage extends BaseMessage {
  type: 'auth';
  role: ClientRole;
  password?: string;
  pairingCode?: string;
  studentName?: string;
  hostname?: string;
  /** Connexion automatique sur le réseau local sans code */
  autoJoin?: boolean;
  /** Connexion automatique au professeur connecté (sans code école) */
  autoDiscover?: boolean;
  /** Code école pour connexion via relais distant (ex: RAP-K7M2X9) */
  schoolCode?: string;
}

export interface AuthResultMessage extends BaseMessage {
  type: 'auth_result';
  success: boolean;
  error?: string;
  studentId?: string;
  sessionToken?: string;
}

export interface StudentRegisterMessage extends BaseMessage {
  type: 'student_register';
  studentName: string;
  hostname: string;
}

export interface StudentListMessage extends BaseMessage {
  type: 'student_list';
  students: StudentInfo[];
  totalConnected: number;
}

export interface ScreenFrameMessage extends BaseMessage {
  type: 'screen_frame';
  studentId: string;
  frame: string; // base64 JPEG
  width: number;
  height: number;
}

export interface TeacherMessage extends BaseMessage {
  type: 'teacher_message';
  /** Utiliser '*' pour diffuser à tous les élèves */
  studentId: string;
  content: string;
  title?: string;
  style?: NotificationStyle;
  durationMs?: number;
  playSound?: boolean;
  persistent?: boolean;
}

export interface ControlRequestMessage extends BaseMessage {
  type: 'control_request';
  studentId: string;
}

export interface ControlResponseMessage extends BaseMessage {
  type: 'control_response';
  studentId: string;
  accepted: boolean;
}

export interface ControlInputMessage extends BaseMessage {
  type: 'control_input';
  studentId: string;
  inputType: 'mousemove' | 'mousedown' | 'mouseup' | 'keydown' | 'keyup' | 'wheel';
  x?: number;
  y?: number;
  button?: number;
  key?: string;
  deltaY?: number;
}

export interface ControlStopMessage extends BaseMessage {
  type: 'control_stop';
  studentId: string;
}

export interface LockScreenMessage extends BaseMessage {
  type: 'lock_screen' | 'unlock_screen';
  studentId: string;
}

export interface BlockInputMessage extends BaseMessage {
  type: 'block_input';
  studentId: string;
  mode: InputBlockMode;
}

export interface RemoteActionMessage extends BaseMessage {
  type: 'remote_action';
  studentId: string;
  action: RemoteActionType;
  payload?: string;
}

export interface ViewingNoticeMessage extends BaseMessage {
  type: 'viewing_notice';
  studentId: string;
  isViewing: boolean;
}

export interface PairingInfoMessage extends BaseMessage {
  type: 'pairing_info';
  code: string;
  expiresAt: string;
  serverIp: string;
  port: number;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: string;
  message: string;
}

export type ProtocolMessage =
  | AuthMessage
  | AuthResultMessage
  | StudentRegisterMessage
  | StudentListMessage
  | ScreenFrameMessage
  | TeacherMessage
  | ControlRequestMessage
  | ControlResponseMessage
  | ControlInputMessage
  | ControlStopMessage
  | LockScreenMessage
  | BlockInputMessage
  | RemoteActionMessage
  | ViewingNoticeMessage
  | PairingInfoMessage
  | ErrorMessage
  | BaseMessage;

export function createMessage<T extends ProtocolMessage>(msg: T): T {
  return { ...msg, timestamp: new Date().toISOString() };
}

export const NOTIFICATION_STYLE_OPTIONS: {
  value: NotificationStyle;
  label: string;
  description: string;
}[] = [
  { value: 'popup_center', label: 'Popup centre', description: 'Fenêtre modale au centre de l\'écran' },
  { value: 'popup_corner', label: 'Popup coin', description: 'Encart en bas à droite' },
  { value: 'banner_top', label: 'Bandeau haut', description: 'Bandeau pleine largeur en haut' },
  { value: 'banner_bottom', label: 'Bandeau bas', description: 'Bandeau pleine largeur en bas' },
  { value: 'toast', label: 'Toast', description: 'Notification discrète auto-disparition' },
  { value: 'fullscreen_alert', label: 'Alerte plein écran', description: 'Message plein écran impossible à manquer' },
  { value: 'system_only', label: 'Système uniquement', description: 'Notification Windows native seulement' },
];
