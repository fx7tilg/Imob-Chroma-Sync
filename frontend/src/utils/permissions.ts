export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  DECISION_READ: 'decision.read',
  DECISION_CREATE: 'decision.create',
  DECISION_EDIT: 'decision.edit',
  DECISION_DELETE: 'decision.delete',
  APPROVAL_SUBMIT: 'approval.submit',
  APPROVAL_APPROVE: 'approval.approve',
  REPORTS_VIEW: 'reports.view',
  REPORTS_GENERATE: 'reports.generate',
  AUDIT_READ: 'audit.read',
  CONFLICT_RESOLVE: 'conflict.resolve',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  SETTINGS_MANAGE: 'settings.manage'
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const ROLES = {
  PROJECT_ADMIN: 'project_admin',
  DESIGN_APPROVER: 'design_approver',
  DESIGN_EDITOR: 'design_editor',
  DESIGN_VIEWER: 'design_viewer',
  ENGINEERING_APPROVER: 'engineering_approver',
  ENGINEERING_EDITOR: 'engineering_editor',
  ENGINEERING_VIEWER: 'engineering_viewer',
  PROCUREMENT_APPROVER: 'procurement_approver',
  PROCUREMENT_EDITOR: 'procurement_editor',
  PROCUREMENT_VIEWER: 'procurement_viewer',
  QUALITY_APPROVER: 'quality_approver',
  QUALITY_EDITOR: 'quality_editor',
  QUALITY_VIEWER: 'quality_viewer'
} as const;

export type RoleKey = typeof ROLES[keyof typeof ROLES];

export const ROLE_LABELS: Record<RoleKey, string> = {
  project_admin: 'Project Admin',
  design_approver: 'Design Approver',
  design_editor: 'Design Editor',
  design_viewer: 'Design Viewer',
  engineering_approver: 'Engineering Approver',
  engineering_editor: 'Engineering Editor',
  engineering_viewer: 'Engineering Viewer',
  procurement_approver: 'Procurement Approver',
  procurement_editor: 'Procurement Editor',
  procurement_viewer: 'Procurement Viewer',
  quality_approver: 'Quality Approver',
  quality_editor: 'Quality Editor',
  quality_viewer: 'Quality Viewer'
};

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  project_admin: 'Full project control — users, settings, roles, master data, all decision fields.',
  design_approver: 'Approve or reject submitted design data. Resolve conflicts. Can also create and edit.',
  design_editor: 'Create and edit colour codes, material references, and design notes.',
  design_viewer: 'Read-only access to design decisions and reports.',
  engineering_approver: 'Approve or reject engineering feasibility. Resolve conflicts. Can also create and edit.',
  engineering_editor: 'Update feasibility status and technical constraints on decisions.',
  engineering_viewer: 'Read-only access to engineering decisions and reports.',
  procurement_approver: 'Approve or reject procurement data. Resolve conflicts. Can also create and edit.',
  procurement_editor: 'Update supplier details, lead times, and pricing information.',
  procurement_viewer: 'Read-only access to procurement details and reports.',
  quality_approver: 'Final approval authority — approve or reject fully reviewed decisions. Resolve conflicts. Can also create and edit.',
  quality_editor: 'Review quality metrics and compliance statuses.',
  quality_viewer: 'Read-only access to quality reports and decisions.'
};

export const ROLE_BADGE: Record<RoleKey, string> = {
  project_admin: 'badge-accent',
  design_approver: 'badge-blue',
  design_editor: 'badge-blue',
  design_viewer: 'badge-blue',
  engineering_approver: 'badge-amber',
  engineering_editor: 'badge-amber',
  engineering_viewer: 'badge-amber',
  procurement_approver: 'badge-green',
  procurement_editor: 'badge-green',
  procurement_viewer: 'badge-green',
  quality_approver: 'badge-red',
  quality_editor: 'badge-red',
  quality_viewer: 'badge-red'
};

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  project_admin: ALL_PERMISSIONS,
  design_approver: [
    'dashboard.view', 'decision.read', 'decision.create', 'decision.edit', 'approval.submit',
    'approval.approve', 'reports.view', 'reports.generate', 'audit.read', 'conflict.resolve', 'users.view'
  ],
  design_editor: [
    'dashboard.view', 'decision.read', 'decision.create', 'decision.edit',
    'approval.submit', 'reports.view', 'reports.generate'
  ],
  design_viewer: ['dashboard.view', 'decision.read', 'reports.view', 'reports.generate'],
  engineering_approver: [
    'dashboard.view', 'decision.read', 'decision.create', 'decision.edit', 'approval.submit',
    'approval.approve', 'reports.view', 'reports.generate', 'audit.read', 'conflict.resolve', 'users.view'
  ],
  engineering_editor: [
    'dashboard.view', 'decision.read', 'decision.edit',
    'approval.submit', 'reports.view', 'reports.generate'
  ],
  engineering_viewer: ['dashboard.view', 'decision.read', 'reports.view', 'reports.generate'],
  procurement_approver: [
    'dashboard.view', 'decision.read', 'decision.create', 'decision.edit', 'approval.submit',
    'approval.approve', 'reports.view', 'reports.generate', 'audit.read', 'conflict.resolve', 'users.view'
  ],
  procurement_editor: [
    'dashboard.view', 'decision.read', 'decision.edit',
    'approval.submit', 'reports.view', 'reports.generate'
  ],
  procurement_viewer: ['dashboard.view', 'decision.read', 'reports.view', 'reports.generate'],
  quality_approver: [
    'dashboard.view', 'decision.read', 'decision.create', 'decision.edit', 'approval.submit',
    'approval.approve', 'reports.view', 'reports.generate', 'audit.read', 'conflict.resolve', 'users.view'
  ],
  quality_editor: [
    'dashboard.view', 'decision.read', 'approval.submit',
    'reports.view', 'reports.generate'
  ],
  quality_viewer: ['dashboard.view', 'decision.read', 'reports.view', 'reports.generate']
};

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export const PERMISSION_CATALOG: Array<{
  key: PermissionKey;
  label: string;
  riskLevel: RiskLevel;
}> = [
    { key: 'dashboard.view', label: 'View Dashboard', riskLevel: 'low' },
    { key: 'decision.read', label: 'Read Decisions', riskLevel: 'low' },
    { key: 'decision.create', label: 'Create Decisions', riskLevel: 'medium' },
    { key: 'decision.edit', label: 'Edit Decisions', riskLevel: 'medium' },
    { key: 'decision.delete', label: 'Delete Decisions', riskLevel: 'high' },
    { key: 'approval.submit', label: 'Submit for Approval', riskLevel: 'medium' },
    { key: 'approval.approve', label: 'Approve Decisions', riskLevel: 'high' },
    { key: 'reports.view', label: 'View Reports', riskLevel: 'low' },
    { key: 'reports.generate', label: 'Generate Reports', riskLevel: 'medium' },
    { key: 'audit.read', label: 'View Audit Logs', riskLevel: 'low' },
    { key: 'conflict.resolve', label: 'Resolve Conflicts', riskLevel: 'high' },
    { key: 'users.view', label: 'View Team Members', riskLevel: 'low' },
    { key: 'users.manage', label: 'Manage Team Members', riskLevel: 'high' },
    { key: 'roles.manage', label: 'Manage Roles', riskLevel: 'critical' },
    { key: 'settings.manage', label: 'Manage Settings', riskLevel: 'high' }
  ];

export function roleFromProfile(profile: {
  team: string | null;
  is_project_lead: boolean;
  role?: string | null;
} | null): RoleKey {
  if (!profile) return 'design_viewer'; // fallback
  if (profile.is_project_lead) return 'project_admin';
  const team = profile.team;
  if (team === 'design' || team === 'engineering' || team === 'procurement' || team === 'quality') {
    let roleStr = profile.role || 'viewer';
    if (roleStr === 'lead') roleStr = 'approver'; // Map legacy DB 'lead' to 'approver'
    const key = `${team}_${roleStr}`;
    if (Object.keys(ROLES).includes(key.toUpperCase())) {
      return key as RoleKey;
    }
  }
  return 'design_viewer'; // default fallback instead of generic viewer
}
