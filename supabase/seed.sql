-- Demo seed data. Owned by Jaymin (P4); everyone adds rows through a PR.
-- Migrations live in supabase/migrations/ and are named YYYYMMDDHHMM_<owner>_<what>.sql.
--
-- Building ids are fixed so mocks (packages/shared/mocks/) and seed rows agree.
-- Coordinates come from OpenStreetMap (© OpenStreetMap contributors, ODbL), looked up 2026-11-14.

insert into buildings (id, code, name, lat, lng) values
  ('b0000000-0000-0000-0000-000000000001', 'GFS', 'Grace Ford Salvatori Hall',        34.021307, -118.288031),
  ('b0000000-0000-0000-0000-000000000002', 'LVL', 'Leavey Library',                   34.021785, -118.282940),
  ('b0000000-0000-0000-0000-000000000003', 'DML', 'Doheny Memorial Library',          34.020163, -118.283741),
  ('b0000000-0000-0000-0000-000000000004', 'THH', 'Taper Hall',                       34.022229, -118.284616),
  ('b0000000-0000-0000-0000-000000000005', 'SAL', 'Salvatori Computer Science Center', 34.019485, -118.289513),
  ('b0000000-0000-0000-0000-000000000006', 'RTH', 'Ronald Tutor Hall',                34.020087, -118.289835),
  ('b0000000-0000-0000-0000-000000000007', 'OHE', 'Olin Hall of Engineering',         34.020693, -118.289505),
  ('b0000000-0000-0000-0000-000000000008', 'KAP', 'Kaprielian Hall',                  34.022414, -118.291023),
  ('b0000000-0000-0000-0000-000000000009', 'TCC', 'Ronald Tutor Campus Center',       34.020397, -118.286346),
  ('b0000000-0000-0000-0000-000000000010', 'JFF', 'Jill & Frank Fertitta Hall',       34.018675, -118.282461),
  ('b0000000-0000-0000-0000-000000000011', 'WPH', 'Waite Phillips Hall',              34.021956, -118.283825),
  ('b0000000-0000-0000-0000-000000000012', 'ZHS', 'Zumberge Hall',                    34.019320, -118.286337),
  ('b0000000-0000-0000-0000-000000000013', 'SGM', 'Seeley G. Mudd Building',          34.021507, -118.288944),
  ('b0000000-0000-0000-0000-000000000014', 'ASC', 'Wallis Annenberg Hall',            34.020776, -118.287024),
  ('b0000000-0000-0000-0000-000000000015', 'LRC', 'Lyon Recreation Center',           34.024406, -118.288427),
  ('b0000000-0000-0000-0000-000000000016', 'VIL', 'USC Village',                      34.025883, -118.285232)
on conflict (code) do nothing;

-- Where complaints get sent. Every URL returned HTTP 200 on 2026-11-14.
-- Emails are left null on purpose: only add one copied from an official page.
insert into routes (department, category, form_url, email) values
  ('Facilities',     '*', 'https://fpm.usc.edu/customer-guide-to-services/', null),
  ('Housing',        '*', 'https://housing.usc.edu/index.php/section/after-move-in/', null),
  ('ITS',            '*', 'https://itservices.usc.edu/about/contact/', null),
  ('Transportation', '*', 'https://transnet.usc.edu/index.php/report-a-maintenance-issue/', null),
  ('DPS',            '*', 'https://dps.usc.edu/contact/', null)
on conflict (department, category) do nothing;

-- TODO P2 (Vishwa): dropoff_points, verified from official DPS / IT pages.
-- TODO P3 (Parnavi): events, deals, reward_programs.
-- TODO P4 (Jaymin): 25 demo complaints including the GFS 213 cluster.
