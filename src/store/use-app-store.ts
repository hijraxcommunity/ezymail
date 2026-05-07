import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Email, Folder } from '@prisma/client';

export type AuthView = 'login' | 'register' | 'forgot-password' | null;
export type MailView = 'inbox' | 'sent' | 'drafts' | 'trash' | 'starred' | 'archive' | 'search' | 'folder' | 'scheduled' | 'snoozed';
export type SettingsView = 'profile' | 'settings' | null;
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
}

export interface EmailWithSender extends Email {
  sender: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'avatar'> | null;
  recipient: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'avatar'> | null;
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
  replyToEmail: EmailWithSender | null;
  replyMode: 'reply' | 'replyAll' | 'forward' | null;
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
  setSelectedEmailId: (id: string | null) => void;
  setComposeOpen: (open: boolean) => void;
  setReplyToEmail: (email: EmailWithSender | null, mode?: 'reply' | 'replyAll' | 'forward') => void;
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
      replyToEmail: null,
      replyMode: null,
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
      setCurrentFolder: (folder) => set({
        currentFolder: folder,
        currentPage: 1,
        selectedEmailId: null,
        emailDetailOpen: false,
        multiSelectMode: false,
        selectedEmailIds: new Set(),
      }),
      setCurrentFolderId: (id) => set({
        currentFolder: 'folder',
        currentFolderId: id,
        currentPage: 1,
        selectedEmailId: null,
        multiSelectMode: false,
        selectedEmailIds: new Set(),
      }),
      setEmails: (emails) => set({ emails }),
      setSelectedEmailId: (id) => set({ selectedEmailId: id, emailDetailOpen: !!id }),
      setComposeOpen: (open) => set({ composeOpen: open, replyToEmail: null, replyMode: null }),
      setReplyToEmail: (email, mode) => set({ replyToEmail: email, composeOpen: true, replyMode: mode || null }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSearchResults: (results) => set({ searchResults: results }),
      setTotalEmails: (total) => set({ totalEmails: total }),
      setCurrentPage: (page) => set({ currentPage: page }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      addEmail: (email) => set((state) => ({ emails: [email, ...state.emails] })),
      updateEmail: (id, data) => set((state) => ({
        emails: state.emails.map((e) => (e.id === id ? { ...e, ...data } : e)),
      })),
      removeEmail: (id) => set((state) => ({
        emails: state.emails.filter((e) => e.id !== id),
        selectedEmailId: state.selectedEmailId === id ? null : state.selectedEmailId,
      })),

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
        set({
          emails: state.emails.filter((e) => !state.selectedEmailIds.has(e.id)),
          selectedEmailIds: new Set(),
          multiSelectMode: false,
        });
        return selected;
      },
      archiveSelected: () => {
        const state = get();
        const selected = state.emails.filter((e) => state.selectedEmailIds.has(e.id));
        set({
          emails: state.emails.filter((e) => !state.selectedEmailIds.has(e.id)),
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
      logout: () => set({
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
      }),
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
