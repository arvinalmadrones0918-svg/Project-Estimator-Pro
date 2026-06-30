# Administrator Manual

Administrators have full access via the **Administration** tab.

## Users

Create, edit, and deactivate users. Fields: Employee ID, Username, Password,
First/Last Name, Position, Department, Office, Email, Mobile, Status, Photo,
Signature, and Role. Deactivating a user blocks sign-in while preserving their
history. You cannot delete your own account.

## Roles & Permissions

Nine built-in roles are provided (Administrator, Senior Estimator, Estimator,
Project Engineer, Project Manager, Reviewer, Approver, Procurement Officer,
Viewer); you can create custom roles. Permissions are per **module × action**:

- Modules: Projects, Catalogs, UPA, Assemblies, General Requirements,
  Procurement, Tender, Reports, Administration, Import, Export.
- Actions: view, edit, delete, approve.

Edit a role's permission matrix from **Administration → Roles & Permissions**.

## Approval workflow

Estimates flow: Draft → For Review → (Returned → Resubmitted →) Approved →
Issued → Archived. Approval supports multiple levels with an electronic
approval history. Only users with `Projects:approve` can approve or return.

## Project locking

Only one user can edit a project at a time. The workspace shows who holds the
lock and when it was taken. Administrators can **Force Unlock**. Stale locks
expire automatically after 30 minutes.

## Audit & history reports

**Administration → Audit Log / Login History / Approval History** record every
login/logout/create/edit/delete/approve/reject and approval decision. The
change log (Tendering → Change Log) records field-level before/after values
with reasons.

## Security policy

- Passwords are hashed with scrypt. Minimum length is 6 characters.
- Accounts lock for 15 minutes after 5 failed login attempts.
- Sessions time out after 30 minutes of inactivity (30 days with Remember Me).
- Change the default `admin` / `admin123` password immediately after install.

## Backups

Use the provided `scripts/backup.sh` (see DEPLOYMENT.md) to snapshot the SQLite
database on a schedule. Test restores periodically.
