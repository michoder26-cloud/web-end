import * as migration_20260918_151419_initial from './20260918_151419_initial';
import * as migration_20261101_164518_add_roles from './20261101_164518_add_roles';

export const migrations = [
  {
    up: migration_20260918_151419_initial.up,
    down: migration_20260918_151419_initial.down,
    name: '20260918_151419_initial',
  },
  {
    up: migration_20261101_164518_add_roles.up,
    down: migration_20261101_164518_add_roles.down,
    name: '20261101_164518_add_roles'
  },
];
