import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Email, Folder } from '@prisma/client';

export type AuthView = 'login' | 'register' | 'business-register' | 'business-login' | 'forgot-password' | null;
export type MailView = 'inbox' | 'sent' | 'drafts' | 'trash' | 'starred' | 'archive' | 'search' | 'folder' | 'scheduled' | 'snoozed' | 'spam';
export type SettingsView = string | null;
export type AdminView = 'dashboard' | 'users' | 'reports' | 'logs' | 'settings' | null;

interface UserSafe {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  role: string;
  status: string;
  onboardingDone: boolean;
  accountType?: string;
}

export interface EmailWithSender extends Email {
  sender: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'avatar' | 'bio'> | null;
  recipient: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'avatar' | 'bio'> | null;
  replies?: EmailWithSender[];
}

export interface UndoAction {
  id: string;
  type: 'delete' | 'archive' | 'move';
  email: EmailWithSender;
  timestamp: number;
}

export interface Label {
  id: string;
  userId: string;
  name: string;
  color: string;
  createdAt: string;
  emailCount?: number;
}

export interface Template {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
}

export interface Rule {
  id: string;
  userId: string;
  name: string;
  conditions: string;
  actions: string;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Attachment object as stored in email.attachments JSON (base64 data embedded)
export interface AttachmentFile {
  name: string;
  url: string;
  size?: string | number;
  type?: string;
  data?: string;
}

// ─── Recently-removed guard (delete-resurrection fix, 2026-11-09) ──────────
// The 15s poll and the visibilitychange refresh MERGE page 1 into the list.
// A response that was already in flight when the user deleted rows still
// contains them; without this guard those rows were merged straight back
// into the list — the owner's "when I delete the email it comes back like
// nothing happened", and select-all + delete kept leaving stragglers.
// Explicit restores (undo snackbar → addEmail) bypass the guard on purpose.
const RECENT_REMOVE_TTL_MS = 60_000;
const recentlyRemovedIds = new Map<string, number>();
function recordRemovedId(id: string, threadKey?: string | null): void {
  const now = Date.now();
  recentlyRemovedIds.set(id, now);
  // The conversation's OTHER rows (hidden on the list by the server's
  // thread grouping) must be guarded too: an in-flight poll / page-1
  // response generated before the server finished trashing the conversation
  // still carries those siblings, and re-inserting one of them is exactly
  // the "deleted email flashes back like a ghost, then disappears" owner
  // report 2026-11-10. The key matches how the server scopes its
  // conversation delete: threadId, or the row's own id when it IS the root.
  if (threadKey && threadKey !== id) recentlyRemovedIds.set(threadKey, now);
  for (const [k, t] of recentlyRemovedIds) {
    if (now - t > RECENT_REMOVE_TTL_MS) recentlyRemovedIds.delete(k);
  }
}
function clearRemovedId(id: string, threadKey?: string | null): void {
  recentlyRemovedIds.delete(id);
  if (threadKey) recentlyRemovedIds.delete(threadKey);
}
function wasRecentlyRemoved(id: string): boolean {
  const t = recentlyRemovedIds.get(id);
  if (t === undefined) return false;
  if (Date.now() - t > RECENT_REMOVE_TTL_MS) {
    recentlyRemovedIds.delete(id);
    return false;
  }
  return true;
}
/** Folder navigation: the guard's one job is to stop an in-flight poll
 *  response — one already on the wire BEFORE the server committed the
 *  delete — from re-inserting deleted rows into the view the user is
 *  LOOKING AT. It was never meant to follow the user across folders:
 *  "id X was deleted in the inbox" then filtering the same id out of the
 *  TRASH fetch made every just-deleted email invisible in Trash for the
 *  whole 60s TTL ("deleted emails do not go to Trash", owner report
 *  2026-11-10), and the trash Restore path (removeEmail on the trash row)
 *  re-armed the same guard against the Inbox, so a restored email never
 *  reappeared there ("Restore button does not work"). Every fetch after a
 *  navigation is fresh and initiated AFTER the delete API already
 *  returned — the server state is converged, there is nothing left to
 *  protect, so navigation clears the guard. Same-view in-flight-poll
 *  protection is untouched (no navigation happened). */
function clearAllRemovedIds(): void {
  recentlyRemovedIds.clear();
}
/** Row-level guard check: the row itself (by id) AND any sibling of a
 *  just-deleted conversation (by threadId — the root's own id is already
 *  covered by the id check). Used by BOTH merge paths so a response that
 *  was in flight during a delete can never resurrect the conversation. */
function wasRecentlyRemovedRow(email: { id: string; threadId: string | null }): boolean {
  if (wasRecentlyRemoved(email.id)) return true;
  return !!email.threadId && wasRecentlyRemoved(email.threadId);
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  hasAttachment: boolean;
  isUnread: boolean;
  isStarred: boolean;
  before: string;
  after: string;
  folder: string;
  label: string;
  createdAt: string;
}

export interface SearchOperators {
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  before?: string;
  after?: string;
  folder?: string;
  label?: string;
}

interface AppState {
  // Auth
  user: UserSafe | null;
  isAuthenticated: boolean;
  authView: AuthView;

  // Mail
  currentFolder: MailView;
  currentFolderId: string | null;
  emails: EmailWithSender[];
  selectedEmailId: string | null;
  composeOpen: boolean;
  requestComposeClose: boolean;
  replyToEmail: EmailWithSender | null;
  replyMode: 'reply' | 'replyAll' | 'forward' | null;
  editDraftEmail: EmailWithSender | null;
  searchQuery: string;
  searchResults: EmailWithSender[];
  totalEmails: number;
  currentPage: number;
  isLoading: boolean;

  // Multi-select
  selectedEmailIds: Set<string>;
  multiSelectMode: boolean;

  // Undo
  undoAction: UndoAction | null;

  // Onboarding
  showOnboarding: boolean;

  // Notifications
  newEmailNotification: string | null;
  setNewEmailNotification: (emailId: string | null) => void;

  // Settings
  settingsView: SettingsView;

  // Admin
  adminView: AdminView;

  // Contacts
  contactsView: boolean;

  // Attachment viewer (full-screen document viewer, opened from email detail)
  attachmentViewer: AttachmentFile | null;

  // Folder navigation history (for mobile back button)
  folderHistory: { folder: MailView; folderId: string | null }[];
  setFolderHistory: (history: { folder: MailView; folderId: string | null }[]) => void;

  // Mobile
  sidebarOpen: boolean;
  emailDetailOpen: boolean;

  // Labels
  labels: Label[];
  emailLabelsMap: Record<string, Label[]>;

  // Templates
  templates: Template[];

  // Rules
  rules: Rule[];

  // Recent searches
  recentSearches: string[];

  // PRD 5.2: Scroll memory per folder
  scrollPositions: Record<string, number>;
  setScrollPosition: (folder: string, position: number) => void;

  // Saved searches
  savedSearches: SavedSearch[];

  // Search total for result count
  searchTotal: number;

  // Active search operators (parsed from current query)
  searchOperators: SearchOperators | null;

  // Actions - Auth
  setUser: (user: UserSafe | null) => void;
  setAuthView: (view: AuthView) => void;

  // Actions - Mail
  setCurrentFolder: (folder: MailView) => void;
  setCurrentFolderId: (id: string | null) => void;
  setEmails: (emails: EmailWithSender[]) => void;
  /** Gmail-style pagination: merge the next page into the loaded list.
   *  Dedupes by id and hides replies whose root email is already visible.
   *  Returns how many emails were actually added (0 = history exhausted). */
  appendEmails: (incoming: EmailWithSender[]) => number;
  setSelectedEmailId: (id: string | null) => void;
  setComposeOpen: (open: boolean) => void;
  setReplyToEmail: (email: EmailWithSender | null, mode?: 'reply' | 'replyAll' | 'forward') => void;
  setEditDraftEmail: (email: EmailWithSender | null) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: EmailWithSender[]) => void;
  setTotalEmails: (total: number) => void;
  setCurrentPage: (page: number) => void;
  setIsLoading: (loading: boolean) => void;
  addEmail: (email: EmailWithSender) => void;
  updateEmail: (id: string, data: Partial<EmailWithSender>) => void;
  removeEmail: (id: string) => void;

  // Actions - Multi-select
  toggleSelectEmail: (id: string) => void;
  selectAllEmails: () => void;
  clearSelection: () => void;
  setMultiSelectMode: (on: boolean) => void;
  deleteSelected: () => EmailWithSender[];
  archiveSelected: () => EmailWithSender[];
  markSelectedRead: (read: boolean) => void;

  // Actions - Undo
  setUndoAction: (action: UndoAction | null) => void;

  // Actions - Onboarding
  setShowOnboarding: (show: boolean) => void;

  // Actions - Settings
  setSettingsView: (view: SettingsView) => void;

  // Actions - Admin
  setAdminView: (view: AdminView) => void;

  // Actions - Contacts
  setContactsView: (view: boolean) => void;

  // Actions - Attachment viewer
  setAttachmentViewer: (attachment: AttachmentFile | null) => void;

  // Actions - Mobile
  setSidebarOpen: (open: boolean) => void;
  setEmailDetailOpen: (open: boolean) => void;

  // Actions - Search
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  setSearchTotal: (total: number) => void;
  setSearchOperators: (ops: SearchOperators | null) => void;
  addSavedSearch: (search: SavedSearch) => void;
  removeSavedSearch: (id: string) => void;
  clearSavedSearches: () => void;

  // Actions - Labels
  setLabels: (labels: Label[]) => void;
  addLabel: (label: Label) => void;
  updateLabel: (id: string, data: Partial<Label>) => void;
  removeLabel: (id: string) => void;
  setEmailLabels: (emailId: string, labels: Label[]) => void;
  removeLabelFromEmail: (emailId: string, labelId: string) => void;

  // Actions - Templates
  setTemplates: (templates: Template[]) => void;
  addTemplate: (template: Template) => void;
  updateTemplate: (id: string, data: Partial<Template>) => void;
  removeTemplate: (id: string) => void;

  // Actions - Rules
  setRules: (rules: Rule[]) => void;
  addRule: (rule: Rule) => void;
  updateRule: (id: string, data: Partial<Rule>) => void;
  removeRule: (id: string) => void;

  // Actions - General
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      isAuthenticated: false,
      authView: 'login',

      // Mail
      currentFolder: 'inbox',
      currentFolderId: null,
      emails: [],
      selectedEmailId: null,
      composeOpen: false,
      requestComposeClose: false,
      replyToEmail: null,
      replyMode: null,
      editDraftEmail: null,
      searchQuery: '',
      searchResults: [],
      totalEmails: 0,
      currentPage: 1,
      isLoading: false,

      // Multi-select
      selectedEmailIds: new Set<string>(),
      multiSelectMode: false,

      // Undo
      undoAction: null,

      // Onboarding
      showOnboarding: false,

      // Notifications
      newEmailNotification: null,

      // Settings
      settingsView: null,

      // Admin
      adminView: null,

      // Contacts
      contactsView: false,

      // Attachment viewer
      attachmentViewer: null,

      // Folder navigation history
      folderHistory: [{ folder: 'inbox' as MailView, folderId: null }],
      setFolderHistory: (history) => set({ folderHistory: history }),

      // Mobile
      sidebarOpen: false,
      emailDetailOpen: false,

      // Labels
      labels: [],
      emailLabelsMap: {},

      // Templates
      templates: [],

      // Rules
      rules: [],

      // Recent searches
      recentSearches: [],
      scrollPositions: {},
      setScrollPosition: (folder, position) => set((s) => ({
        scrollPositions: { ...s.scrollPositions, [folder]: position },
      })),

      // Saved searches
      savedSearches: [],

      // Search total
      searchTotal: 0,

      // Active search operators
      searchOperators: null,

      // Actions - Auth
      setUser: (user) => set({ user, isAuthenticated: !!user, authView: null, showOnboarding: false }),
      setAuthView: (view) => set({ authView: view }),

      // Actions - Mail
      setCurrentFolder: (folder) => {
        // Navigation = fresh post-delete server state; see
        // clearAllRemovedIds for why the removal guard must not leak
        // across folders (it blanked Trash and ate restored mail).
        clearAllRemovedIds();
        set({
          currentFolder: folder,
          currentPage: 1,
          selectedEmailId: null,
          emailDetailOpen: false,
          multiSelectMode: false,
          selectedEmailIds: new Set(),
        });
      },
      setCurrentFolderId: (id) => {
        // Same navigation semantics as setCurrentFolder — clear the guard.
        clearAllRemovedIds();
        set({
          currentFolder: 'folder',
          currentFolderId: id,
          currentPage: 1,
          selectedEmailId: null,
          multiSelectMode: false,
          selectedEmailIds: new Set(),
        });
      },
      setEmails: (emails) => set(() => ({
        // Page-1 replace is the one merge path with NO seenIds protection,
        // so a response generated before the server finished the delete
        // re-inserted the deleted row verbatim (it reappeared as a ghost
        // until the next replace removed it — owner report 2026-11-10).
        // Same recently-removed filter as appendEmails applies here.
        emails: emails.filter((e) => !wasRecentlyRemovedRow(e)),
      })),
      appendEmails: (incoming) => {
        if (!incoming.length) return 0
        const state = get()
        const seenIds = new Set(state.emails.map((e) => e.id))
        // Row index per thread (threadId, or the row's own id when it is the
        // thread root) so a NEWER message of a loaded thread can take the
        // thread's slot — matching what a manual refresh (full page-1
        // replace) would display. Without this, a reply to an existing
        // conversation was silently dropped and the inbox froze until the
        // owner refreshed manually.
        const threadIndex = new Map<string, number>()
        state.emails.forEach((e, i) => {
          const key = e.threadId || e.id
          if (!threadIndex.has(key)) threadIndex.set(key, i)
        })
        let appended = 0
        const next = [...state.emails]
        for (const e of incoming) {
          if (seenIds.has(e.id)) continue
          // Rows removed on this device within the TTL window (delete /
          // archive / spam …): skip — an in-flight poll response must not
          // resurrect them before the server's removal converges. The
          // check covers the row itself AND its deleted conversation's
          // siblings (the ghost-flash-back path).
          if (wasRecentlyRemovedRow(e)) continue
          // Reply in a thread we already show: replace the current row only
          // when the incoming one is NEWER (poll page-1 case). Older rows
          // (scroll-loaded history) keep being skipped — no duplicates.
          if (e.threadId && e.threadId !== e.id && threadIndex.has(e.threadId)) {
            const i = threadIndex.get(e.threadId)!
            const current = next[i]
            if (current && new Date(e.createdAt).getTime() > new Date(current.createdAt).getTime()) {
              next[i] = e
            }
            continue
          }
          threadIndex.set(e.threadId || e.id, next.length)
          next.push(e)
          appended++
        }
        if (appended > 0 || next.length !== state.emails.length || next.some((e, i) => e !== state.emails[i])) {
          set({ emails: next })
        }
        return appended
      },
      setSelectedEmailId: (id) => set({ selectedEmailId: id, emailDetailOpen: !!id }),
      setComposeOpen: (open) => set({ composeOpen: open, replyToEmail: null, replyMode: null, editDraftEmail: null, requestComposeClose: false }),
      setReplyToEmail: (email, mode) => set({ replyToEmail: email, composeOpen: true, replyMode: mode || null }),
      setEditDraftEmail: (email) => set({ editDraftEmail: email, composeOpen: true }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSearchResults: (results) => set({ searchResults: results }),
      setTotalEmails: (total) => set({ totalEmails: total }),
      setCurrentPage: (page) => set({ currentPage: page }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      addEmail: (email) => {
        // Explicit restore (undo snackbar) lifts the guard for this row AND
        // its conversation — otherwise a page-1 replace within the TTL
        // window would silently drop the mail the user just brought back.
        clearRemovedId(email.id, email.threadId || email.id);
        set((state) => ({ emails: [email, ...state.emails] }));
      },
      updateEmail: (id, data) => set((state) => ({
        emails: state.emails.map((e) => (e.id === id ? { ...e, ...data } : e)),
      })),
      removeEmail: (id) => {
        // Look up the row BEFORE filtering so the whole conversation's key
        // gets guarded too (server delete/archive follow the conversation).
        const removedRow = get().emails.find((e) => e.id === id);
        const threadKey = removedRow ? (removedRow.threadId || removedRow.id) : null;
        recordRemovedId(id, threadKey);
        set((state) => ({
          // The server delete is conversation-scoped, so the client list must
          // be too: a scroll-loaded SIBLING (an older member of the same
          // thread that arrived via page 2+) would otherwise linger on screen
          // after the visible row is deleted — the same ghost class as the
          // owner's 2026-11-10 report. Root rows carry threadId === id, so
          // both the id and threadId checks find them.
          emails: state.emails.filter((e) =>
            e.id !== id &&
            !(threadKey && (e.id === threadKey || (!!e.threadId && e.threadId === threadKey)))
          ),
          selectedEmailId: state.selectedEmailId === id ? null : state.selectedEmailId,
        }));
      },

      // Actions - Multi-select
      toggleSelectEmail: (id) => set((state) => {
        const next = new Set(state.selectedEmailIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { selectedEmailIds: next, multiSelectMode: next.size > 0 };
      }),
      selectAllEmails: () => set((state) => ({
        selectedEmailIds: new Set(state.emails.map((e) => e.id)),
        multiSelectMode: true,
      })),
      clearSelection: () => set({ selectedEmailIds: new Set(), multiSelectMode: false }),
      setMultiSelectMode: (on) => set({ multiSelectMode: on, selectedEmailIds: on ? get().selectedEmailIds : new Set() }),
      deleteSelected: () => {
        const state = get();
        const selected = state.emails.filter((e) => state.selectedEmailIds.has(e.id));
        const removedKeys = new Set<string>();
        selected.forEach((e) => {
          recordRemovedId(e.id, e.threadId);
          removedKeys.add(e.threadId || e.id);
        });
        set({
          // Conversation-scoped removal — mirrors the server delete; see
          // removeEmail above for why siblings must go with the row.
          emails: state.emails.filter((e) =>
            !state.selectedEmailIds.has(e.id) &&
            !(removedKeys.has(e.id) || (!!e.threadId && removedKeys.has(e.threadId)))
          ),
          selectedEmailIds: new Set(),
          multiSelectMode: false,
        });
        return selected;
      },
      archiveSelected: () => {
        const state = get();
        const selected = state.emails.filter((e) => state.selectedEmailIds.has(e.id));
        const removedKeys = new Set<string>();
        selected.forEach((e) => {
          recordRemovedId(e.id, e.threadId);
          removedKeys.add(e.threadId || e.id);
        });
        set({
          // Conversation-scoped removal — mirrors the server archive scoping
          // (PUT follows the conversation for this user's received copies).
          emails: state.emails.filter((e) =>
            !state.selectedEmailIds.has(e.id) &&
            !(removedKeys.has(e.id) || (!!e.threadId && removedKeys.has(e.threadId)))
          ),
          selectedEmailIds: new Set(),
          multiSelectMode: false,
        });
        return selected;
      },
      markSelectedRead: (read) => set((state) => ({
        emails: state.emails.map((e) => state.selectedEmailIds.has(e.id) ? { ...e, isRead: read } : e),
        selectedEmailIds: new Set(),
        multiSelectMode: false,
      })),

      // Actions - Undo
      setUndoAction: (action) => set({ undoAction: action }),

      // Actions - Onboarding
      setShowOnboarding: (show) => set({ showOnboarding: show }),

      // Notifications
      setNewEmailNotification: (emailId) => set({ newEmailNotification: emailId }),

      // Actions - Settings
      setSettingsView: (view) => set({ settingsView: view, adminView: null }),
      setAdminView: (view) => set({ adminView: view, settingsView: null }),
      setContactsView: (view) => set({ contactsView: view }),
      setAttachmentViewer: (attachment) => set({ attachmentViewer: attachment }),

      // Actions - Mobile
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setEmailDetailOpen: (open) => set({ emailDetailOpen: open }),

      // Actions - Search
      addRecentSearch: (query) => set((state) => ({
        recentSearches: [query, ...state.recentSearches.filter((q) => q !== query)].slice(0, 5),
      })),
      clearRecentSearches: () => set({ recentSearches: [] }),
      setSearchTotal: (total) => set({ searchTotal: total }),
      setSearchOperators: (ops) => set({ searchOperators: ops }),
      addSavedSearch: (search) => set((state) => ({
        savedSearches: [search, ...state.savedSearches].slice(0, 20),
      })),
      removeSavedSearch: (id) => set((state) => ({
        savedSearches: state.savedSearches.filter((s) => s.id !== id),
      })),
      clearSavedSearches: () => set({ savedSearches: [] }),

      // Actions - Labels
      setLabels: (labels) => set({ labels }),
      addLabel: (label) => set((state) => ({ labels: [...state.labels, label] })),
      updateLabel: (id, data) => set((state) => ({
        labels: state.labels.map((l) => (l.id === id ? { ...l, ...data } : l)),
      })),
      removeLabel: (id) => set((state) => ({
        labels: state.labels.filter((l) => l.id !== id),
        emailLabelsMap: Object.fromEntries(
          Object.entries(state.emailLabelsMap).map(([emailId, labels]) => [
            emailId,
            labels.filter((l) => l.id !== id),
          ])
        ),
      })),
      setEmailLabels: (emailId, labels) => set((state) => ({
        emailLabelsMap: { ...state.emailLabelsMap, [emailId]: labels },
      })),
      removeLabelFromEmail: (emailId, labelId) => set((state) => {
        const current = state.emailLabelsMap[emailId] || []
        return {
          emailLabelsMap: {
            ...state.emailLabelsMap,
            [emailId]: current.filter((l) => l.id !== labelId),
          },
        }
      }),

      // Actions - Templates
      setTemplates: (templates) => set({ templates }),
      addTemplate: (template) => set((state) => ({ templates: [template, ...state.templates] })),
      updateTemplate: (id, data) => set((state) => ({
        templates: state.templates.map((t) => (t.id === id ? { ...t, ...data } : t)),
      })),
      removeTemplate: (id) => set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
      })),

      // Actions - Rules
      setRules: (rules) => set({ rules }),
      addRule: (rule) => set((state) => ({ rules: [...state.rules, rule] })),
      updateRule: (id, data) => set((state) => ({
        rules: state.rules.map((r) => (r.id === id ? { ...r, ...data } : r)),
      })),
      removeRule: (id) => set((state) => ({
        rules: state.rules.filter((r) => r.id !== id),
      })),

      // Actions - General
      logout: () => {
        recentlyRemovedIds.clear();
        set({
        user: null,
        isAuthenticated: false,
        authView: 'login',
        emails: [],
        selectedEmailId: null,
        composeOpen: false,
        replyToEmail: null,
        replyMode: null,
        searchQuery: '',
        searchResults: [],
        settingsView: null,
        adminView: null,
        contactsView: false,
        attachmentViewer: null,
        currentFolder: 'inbox',
        currentPage: 1,
        sidebarOpen: false,
        emailDetailOpen: false,
        multiSelectMode: false,
        selectedEmailIds: new Set(),
        undoAction: null,
        showOnboarding: false,
        newEmailNotification: null,
        labels: [],
        emailLabelsMap: {},
        templates: [],
        rules: [],
        searchTotal: 0,
        searchOperators: null,
        });
      },
    }),
    {
      name: 'ezymail-storage',
      partialize: (state) => ({
        recentSearches: state.recentSearches,
        savedSearches: state.savedSearches,
      }),
    }
  )
);
