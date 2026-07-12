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

export interface NoteSession {
  currentDate: string;
  content: string;
  todos: TodoItem[];
  noteDates: Set<string>;
  dirty: boolean;
  setContent: (content: string) => void;
  setTodos: (todos: TodoItem[]) => void;
  changeDate: (date: string) => Promise<void>;
  saveNow: () => Promise<boolean>;
}

export function useNoteSession({ initialDate, onError, saveDelay = 2_000 }: UseNoteSessionOptions): NoteSession {
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [content, setContentState] = useState("");
  const [todos, setTodosState] = useState<TodoItem[]>([]);
  const [noteDates, setNoteDates] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const currentDateRef = useRef(currentDate);
  const contentRef = useRef(content);
  const todosRef = useRef(todos);
  const dirtyRef = useRef(dirty);
  const loadGuardRef = useRef(createLatestRequestGuard());
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

  useEffect(() => {
    const token = loadGuardRef.current.begin();
    void api
      .getNote(currentDate)
      .then((loaded) => {
        if (!loadGuardRef.current.isLatest(token)) return;
        setContentState(loaded?.content ?? "");
        setTodosState(parseTodos(loaded?.todos ?? "[]"));
        dirtyRef.current = false;
        setDirty(false);
      })
      .catch(() => {
        if (loadGuardRef.current.isLatest(token)) onErrorRef.current("加载笔记失败");
      });
  }, [currentDate]);

  const saveSnapshot = useCallback(
    async (date: string, html: string, serializedTodos: string): Promise<boolean> => {
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
        }
        try {
          await refreshNoteDates();
        } catch {
          // Saving succeeded; a failed indicator refresh must not turn it into a failed save.
        }
        return true;
      } catch {
        if (mountedRef.current) onErrorRef.current("保存失败");
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
    scheduleSave();
  }, [scheduleSave]);

  const setTodos = useCallback((nextTodos: TodoItem[]) => {
    todosRef.current = nextTodos;
    dirtyRef.current = true;
    setTodosState(nextTodos);
    setDirty(true);
    scheduleSave();
  }, [scheduleSave]);

  const changeDate = useCallback(
    async (date: string) => {
      clearSaveTimer();
      if (dirtyRef.current) {
        await saveSnapshot(
          currentDateRef.current,
          contentRef.current,
          JSON.stringify(todosRef.current),
        );
      }
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

  return { currentDate, content, todos, noteDates, dirty, setContent, setTodos, changeDate, saveNow };
}
