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
  const [currentDate, setCurrentDate] = useState(initialDate);
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

  const loadDate = useCallback(async (date: string) => {
    const token = loadGuardRef.current.begin();
    setLoadStatus("loading");
    try {
      const loaded = await api.getNote(date);
      if (!loadGuardRef.current.isLatest(token) || !mountedRef.current) return;
      setContentState(loaded?.content ?? "");
      setTodosState(parseTodos(loaded?.todos ?? "[]"));
      dirtyRef.current = false;
      setDirty(false);
      setSaveStatus("saved");
      setLoadStatus("ready");
    } catch {
      if (!loadGuardRef.current.isLatest(token) || !mountedRef.current) return;
      setLoadStatus("error");
      onErrorRef.current("加载笔记失败");
    }
  }, []);

  useEffect(() => {
    void loadDate(currentDate);
  }, [currentDate, loadDate]);

  const retryLoad = useCallback(() => loadDate(currentDateRef.current), [loadDate]);

  const saveSnapshot = useCallback(
    async (date: string, html: string, serializedTodos: string): Promise<boolean> => {
      if (mountedRef.current) setSaveStatus("saving");
      try {
        await api.saveNote(date, html, serializedTodos);
        if (
          mountedRef.current &&
          currentDateRef.current === date &&
          contentRef.current === html &&
          JSON.stringify(todosRef.current) === serializedTodos
        ) {
          dirtyRef.current = false;
          setDirty(false);
          setSaveStatus("saved");
        } else if (mountedRef.current && currentDateRef.current === date) {
          setSaveStatus("dirty");
        }
        try {
          await refreshNoteDates();
        } catch {
          // Saving succeeded; a failed indicator refresh must not turn it into a failed save.
        }
        return true;
      } catch {
        if (mountedRef.current) {
          setSaveStatus("error");
          onErrorRef.current("保存失败");
        }
        return false;
      }
    },
    [refreshNoteDates],
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
    contentRef.current = nextContent;
    dirtyRef.current = true;
    setContentState(nextContent);
    setDirty(true);
    setSaveStatus("dirty");
    scheduleSave();
  }, [scheduleSave]);

  const setTodos = useCallback((nextTodos: TodoItem[]) => {
    todosRef.current = nextTodos;
    dirtyRef.current = true;
    setTodosState(nextTodos);
    setDirty(true);
    setSaveStatus("dirty");
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
      currentDateRef.current = date;
      setCurrentDate(date);
    },
    [clearSaveTimer, saveSnapshot],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearSaveTimer();
      if (dirtyRef.current) {
        void api.saveNote(
          currentDateRef.current,
          contentRef.current,
          JSON.stringify(todosRef.current),
        );
      }
    };
  }, [clearSaveTimer]);

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
