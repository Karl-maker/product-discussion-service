import { DynamoDBClipResultsRepository } from "./infrastructure/repositories/clip-results.repository";
import { SubmitClipResultController } from "./app/controllers/submit.clip.result.controller";
import { GetLatestResultController } from "./app/controllers/get.latest.result.controller";
import { GetClipSnapshotController } from "./app/controllers/get.clip.snapshot.controller";
import { LikeClipController } from "./app/controllers/like.clip.controller";
import { UnlikeClipController } from "./app/controllers/unlike.clip.controller";
import { GetUserLikesController } from "./app/controllers/get.user.likes.controller";
import { CheckLikeController } from "./app/controllers/check.like.controller";
import { SubmitClipResultUseCase } from "./app/usecases/submit.clip.result.usecase";
import { GetLatestResultUseCase } from "./app/usecases/get.latest.result.usecase";
import { GetClipSnapshotUseCase } from "./app/usecases/get.clip.snapshot.usecase";
import { LikeClipUseCase } from "./app/usecases/like.clip.usecase";
import { UnlikeClipUseCase } from "./app/usecases/unlike.clip.usecase";
import { GetUserLikesUseCase } from "./app/usecases/get.user.likes.usecase";
import { CheckLikeUseCase } from "./app/usecases/check.like.usecase";

export function bootstrap() {
  const tableName = process.env.CLIP_RESULTS_TABLE ?? "";
  const repo = new DynamoDBClipResultsRepository(tableName);

  const submitResultUseCase = new SubmitClipResultUseCase(repo);
  const getLatestResultUseCase = new GetLatestResultUseCase(repo);
  const getClipSnapshotUseCase = new GetClipSnapshotUseCase(repo);
  const likeClipUseCase = new LikeClipUseCase(repo);
  const unlikeClipUseCase = new UnlikeClipUseCase(repo);
  const getUserLikesUseCase = new GetUserLikesUseCase(repo);
  const checkLikeUseCase = new CheckLikeUseCase(repo);

  return {
    submitClipResultController: new SubmitClipResultController(submitResultUseCase),
    getLatestResultController: new GetLatestResultController(getLatestResultUseCase),
    getClipSnapshotController: new GetClipSnapshotController(getClipSnapshotUseCase),
    likeClipController: new LikeClipController(likeClipUseCase),
    unlikeClipController: new UnlikeClipController(unlikeClipUseCase),
    getUserLikesController: new GetUserLikesController(getUserLikesUseCase),
    checkLikeController: new CheckLikeController(checkLikeUseCase),
  };
}
