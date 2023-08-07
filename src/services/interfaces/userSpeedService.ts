import {ActivityUnit} from '../../models/activity';

export interface IUserSpeedService {
  predictSpeed(userId: string, type: ActivityUnit): Promise<number>;
  convertUnit(
    userId: string,
    from: ActivityUnit,
    to: ActivityUnit,
    value: number
  ): Promise<number>;
}
