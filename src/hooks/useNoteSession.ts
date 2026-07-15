import { useCallback, useEffect, useRef, useState } from "react";
import { createLatestRequestGuard } from "../lib/latestRequest";
import * as api from "../lib/tauri";
import { parseTodos } from "../lib/types";
import type { TodoItem } from "../lib/types";

export interface UseNoteSessionOptions {
  initialDate: string;
  onError: (message: string) => void;
  saveDelay?: number;
}

export type SaveStatus = "saved" | "dirty" | "saving" | "error";
export type LoadStatus = "loading" | "ready" | "error";

export interface NoteSession {
  currentDate: string;
  content: string;
  todos: TodoItem[];
  noteDates: Set<string>;
  dirty: boolean;
  saveStatus: SaveStatus;
  loadStatus: LoadStatus;
  setContent: (content: string) => void;
  setTodos: (todos: TodoItem[]) => void;
  changeDate: (date: string) => Promise<void>;
  saveNow: () => Promise<boolean>;
  retryLoad: () => Promise<void>;
}

export function useNoteSession({ initialDate, onError, saveDelay = 2_000 }: UseNoteSessionOptions): NoteSession {
  const initialDateRef = useRef(initialDate);
  const [currentDate, setCurrentDate] = useState(initialDateRef.current);
  const [content, setContentState] = useState("");
  const [todos, setTodosState] = useState<TodoItem[]>([]);
  const [noteDates, setNoteDates] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const currentDateRef = useRef(currentDate);
  const contentRef = useRef(content);
  const todosRef = useRef(todos);
  const dirtyRef = useRef(dirty);
  const loadGuardRef = useRef(createLatestRequestGuard());
  const pendingLoadDateRef = useRef<string | null>(null);
  const saveGenerationRef = useRef(0);
  const persistenceTailRef = useRef<Promise<void>>(Promise.resolve());
  const navigationGenerationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);

  currentDateRef.current = currentDate;
  contentRef.current = content;
  todosRef.current = todos;
  dirtyRef.current = dirty;
  onErrorRef.current = onError;

  const clearSaveTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refreshNoteDates = useCallback(async () => {
    const dates = await api.getNotesDates();
    if (mountedRef.current) setNoteDates(new Set(dates));
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .getNotesDates()
      .then((dates) => {
        if (active) setNoteDates(new Set(dates));
      })
      .catch(() => {
        if (active) onErrorRef.current("加载笔记失败");
      });
    return () => {
      active = false;
    };
  }, []);

  const loadDate = useCallback(async (date: string, commitDate = false): Promise<boolean> => {
    const token = loadGuardRef.current.begin();
    setLoadStatus("loading");
    try {
      const loaded = await api.getNote(date);
      if (!loadGuardRef.current.isLatest(token) || !mountedRef.current) return false;
      const loadedContent = loaded?.content ?? "";
      const loadedTodos = parseTodos(loaded?.todos ?? "[]");
      contentRef.current = loadedContent;
      todosRef.current = loadedTodos;
      setContentState(loadedContent);
      setTodosState(loadedTodos);
      if (commitDate) {
        currentDateRef.current = date;
        setCurrentDate(date);
      }
      pendingLoadDateRef.current = null;
      dirtyRef.current = false;
      setDirty(false);
      setSaveStatus("saved");
      setLoadStatus("ready");
      return true;
    } catch {
      if (!loadGuardRef.current.isLatest(token) || !mountedRef.current) return false;
      pendingLoadDateRef.current = date;
      setLoadStatus("error");
      onErrorRef.current("加载笔记失败");
      return false;
    }
  }, []);

  const persistInOrder = useCallback((date: string, html: string, serializedTodos: string) => {
    const operation = persistenceTailRef.current.then(() =>
      api.saveNote(date, html, serializedTodos),
    );
    persistenceTailRef.current = operation.catch(() => undefined);
    return operation;
  }, []);

  useEffect(() => {
    void loadDate(initialDateRef.current);
  }, [loadDate]);

  const saveSnapshot = useCallback(
    async (date: string, html: string, serializedTodos: string): Promise<boolean> => {
      const saveGeneration = ++saveGenerationRef.current;
      if (mountedRef.current) setSaveStatus("saving");
      try {
        await persistInOrder(date, html, serializedTodos);
        if (
          mountedRef.current &&
          saveGeneration === saveGenerationRef.current &&
          currentDateRef.current === date &&
          contentRef.current === html &&
          JSON.stringify(todosRef.current) === serializedTodos
        ) {
          dirtyRef.current = false;
          setDirty(false);
          setSaveStatus("saved");
        } else if (
          mountedRef.current &&
          saveGeneration === saveGenerationRef.current &&
          currentDateRef.current === date
        ) {
          setSaveStatus("dirty");
        }
        try {
          await refreshNoteDates();
        } catch {
          // Saving succeeded; a failed indicator refresh must not turn it into a failed save.
        }
        return true;
      } catch {
        if (mountedRef.current && saveGeneration === saveGenerationRef.current) {
          setSaveStatus("error");
          onErrorRef.current("保存失败");
        }
        return false;
      }
    },
    [persistInOrder, refreshNoteDates],
  );

  const saveNow = useCallback(async () => {
    clearSaveTimer();
    if (!dirtyRef.current) return true;
    return saveSnapshot(currentDateRef.current, contentRef.current, JSON.stringify(todosRef.current));
  }, [clearSaveTimer, saveSnapshot]);

  const scheduleSave = useCallback(() => {
    clearSaveTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveNow();
    }, saveDelay);
  }, [clearSaveTimer, saveDelay, saveNow]);

  const setContent = useCallback((nextContent: string) => {
    loadGuardRef.current.begin();
    contentRef.current = nextContent;
    dirtyRef.current = true;
    setContentState(nextContent);
    setDirty(true);
    setSaveStatus("dirty");
    setLoadStatus(pendingLoadDateRef.current === null ? "ready" : "error");
    scheduleSave();
  }, [scheduleSave]);

  const setTodos = useCallback((nextTodos: TodoItem[]) => {
    loadGuardRef.current.begin();
    todosRef.current = nextTodos;
    dirtyRef.current = true;
    setTodosState(nextTodos);
    setDirty(true);
    setSaveStatus("dirty");
    setLoadStatus(pendingLoadDateRef.current === null ? "ready" : "error");
    scheduleSave();
  }, [scheduleSave]);

  const changeDate = useCallback(
    async (date: string) => {
      const navigationGeneration = ++navigationGenerationRef.current;
      clearSaveTimer();
      if (dirtyRef.current) {
        const snapshotDate = currentDateRef.current;
        const snapshotContent = contentRef.current;
        const snapshotTodos = JSON.stringify(todosRef.current);
        const saved = await saveSnapshot(snapshotDate, snapshotContent, snapshotTodos);
        if (!saved) return;
        if (navigationGeneration !== navigationGenerationRef.current) return;
        if (
          dirtyRef.current ||
          currentDateRef.current !== snapshotDate ||
          contentRef.current !== snapshotContent ||
          JSON.stringify(todosRef.current) !== snapshotTodos
        ) {
          return;
        }
      }
      if (navigationGeneration !== navigationGenerationRef.current) return;
      await loadDate(date, true);
    },
    [clearSaveTimer, loadDate, saveSnapshot],
  );

  const retryLoad = useCallback(async () => {
    const targetDate = pendingLoadDateRef.current ?? currentDateRef.current;
    if (targetDate !== currentDateRef.current) {
      await changeDate(targetDate);
      return;
    }
    await loadDate(targetDate);
  }, [changeDate, loadDate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearSaveTimer();
      if (dirtyRef.current) {
        void persistInOrder(
          currentDateRef.current,
          contentRef.current,
          JSON.stringify(todosRef.current),
        );
      }
    };
  }, [clearSaveTimer, persistInOrder]);

  return {
    currentDate,
    content,
    todos,
    noteDates,
    dirty,
    saveStatus,
    loadStatus,
    setContent,
    setTodos,
    changeDate,
    saveNow,
    retryLoad,
  };
}
