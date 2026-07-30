/**
 * append-only 이벤트 로그 (스펙 §2.1).
 *
 * 이 파일은 INSERT 와 SELECT 만 제공한다. UPDATE/DELETE 를 수행하는 함수는
 * 존재하지 않으며, 가변 boolean 컬럼도 두지 않는다. 모든 파생 상태는
 * projection.ts 의 재생으로만 도출한다.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { AnyStoredEvent, EventPayloadMap, EventType } from './events';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id    TEXT NOT NULL,
  type       TEXT NOT NULL,
  actor      TEXT NOT NULL,
  ts         TEXT NOT NULL,
  payload    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, seq);
`;

const DEFAULT_DB_PATH = 'data/demo.db';

const connections = new Map<string, Database.Database>();

/** 실행 시점의 환경변수를 읽는다 — 테스트가 파일별 격리 DB를 지정할 수 있게 한다. */
export function dbPath(): string {
  return path.resolve(process.env.ANSWER_REGISTRY_DB ?? DEFAULT_DB_PATH);
}

export function getDb(): Database.Database {
  const file = dbPath();
  const existing = connections.get(file);
  if (existing) return existing;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  connections.set(file, db);
  return db;
}

/** 열려 있는 연결을 닫는다. 테스트 teardown 과 seed 재생성에서 사용. */
export function closeDb(file = dbPath()): void {
  const resolved = path.resolve(file);
  const db = connections.get(resolved);
  if (db) {
    db.close();
    connections.delete(resolved);
  }
}

interface EventRow {
  seq: number;
  case_id: string;
  type: string;
  actor: string;
  ts: string;
  payload: string;
}

function toEvent(row: EventRow): AnyStoredEvent {
  return {
    seq: row.seq,
    caseId: row.case_id,
    type: row.type as EventType,
    actor: row.actor,
    ts: row.ts,
    payload: JSON.parse(row.payload),
  } as AnyStoredEvent;
}

/**
 * 이벤트 1건을 append 한다. 반환값은 부여된 seq.
 * 로그를 고쳐 쓰는 경로는 이 모듈 어디에도 없다.
 */
export function appendEvent<T extends EventType>(input: {
  caseId: string;
  type: T;
  actor: string;
  ts: string;
  payload: EventPayloadMap[T];
}): number {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO events (case_id, type, actor, ts, payload) VALUES (?, ?, ?, ?, ?)')
    .run(input.caseId, input.type, input.actor, input.ts, JSON.stringify(input.payload));
  return Number(result.lastInsertRowid);
}

export function readEvents(caseId: string): AnyStoredEvent[] {
  const rows = getDb()
    .prepare('SELECT seq, case_id, type, actor, ts, payload FROM events WHERE case_id = ? ORDER BY seq')
    .all(caseId) as EventRow[];
  return rows.map(toEvent);
}

export function readAllEvents(): AnyStoredEvent[] {
  const rows = getDb()
    .prepare('SELECT seq, case_id, type, actor, ts, payload FROM events ORDER BY seq')
    .all() as EventRow[];
  return rows.map(toEvent);
}

export function listCaseIds(): string[] {
  const rows = getDb()
    .prepare('SELECT case_id FROM events GROUP BY case_id ORDER BY MIN(seq)')
    .all() as { case_id: string }[];
  return rows.map((row) => row.case_id);
}

/**
 * DB 파일을 통째로 지우고 새로 만든다. seed 전용.
 * 기존 이벤트를 UPDATE/DELETE 하는 것이 아니라 로그 자체를 새로 시작하는 것이다.
 */
export function recreateDatabaseFile(): string {
  const file = dbPath();
  closeDb(file);
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const target = `${file}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target);
  }
  getDb();
  return file;
}
