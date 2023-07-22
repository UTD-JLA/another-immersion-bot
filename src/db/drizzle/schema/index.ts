import * as activitiesTablesAndRelations from './activities';
import * as materialsTablesAndRelations from './materials';
import * as userConfigsTablesAndRelations from './userConfigs';
import * as guildConfigsTablesAndRelations from './guildConfigs';

export default {
  ...activitiesTablesAndRelations,
  ...materialsTablesAndRelations,
  ...userConfigsTablesAndRelations,
  ...guildConfigsTablesAndRelations,
};
