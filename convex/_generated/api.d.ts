/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as comments from "../comments.js";
import type * as floorPlanChildData from "../floorPlanChildData.js";
import type * as floorPlanConcepts from "../floorPlanConcepts.js";
import type * as floorPlans from "../floorPlans.js";
import type * as http from "../http.js";
import type * as members from "../members.js";
import type * as planEditAssistant from "../planEditAssistant.js";
import type * as projects from "../projects.js";
import type * as renderPresets from "../renderPresets.js";
import type * as renders from "../renders.js";
import type * as validators from "../validators.js";
import type * as versions from "../versions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  auth: typeof auth;
  comments: typeof comments;
  floorPlanChildData: typeof floorPlanChildData;
  floorPlanConcepts: typeof floorPlanConcepts;
  floorPlans: typeof floorPlans;
  http: typeof http;
  members: typeof members;
  planEditAssistant: typeof planEditAssistant;
  projects: typeof projects;
  renderPresets: typeof renderPresets;
  renders: typeof renders;
  validators: typeof validators;
  versions: typeof versions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
