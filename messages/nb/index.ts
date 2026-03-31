import en from "../en/index";

import common from "./common.json";
import nav from "./nav.json";
import topNav from "./topNav.json";
import modes from "./modes.json";
import actions from "./actions.json";
import status from "./status.json";
import brandLogo from "./brandLogo.json";
import library from "./library.json";
import join from "./join.json";
import unauthorized from "./unauthorized.json";
import landing from "./landing.json";
import lessonsLanding from "./lessonsLanding.json";
import libraryLanding from "./libraryLanding.json";
import readingTestPlayer from "./readingTestPlayer.json";
import content from "./content.json";
import accountBilling from "./accountBilling.json";
import pricing from "./pricing.json";
import postLogin from "./postLogin.json";
import libraryOpenLesson from "./libraryOpenLesson.json";

import authLogin from "./auth/login.json";
import authOnboarding from "./auth/onboarding.json";

import mathMathGeometry from "./math/mathGeometry.json";
import mathMathGeometryPrint from "./math/mathGeometryPrint.json";

import toolsToolsIndex from "./tools/toolsIndex.json";
import toolsTextGeneratorFree from "./tools/textGeneratorFree.json";
import toolsSentenceFixerFree from "./tools/sentenceFixerFree.json";
import toolsSpeakingTopicFree from "./tools/speakingTopicFree.json";
import toolsTranslateFree from "./tools/translateFree.json";
import toolsVocabFree from "./tools/vocabFree.json";

import studentSpaces from "./student/studentSpaces.json";
import studentSpaceDetail from "./student/studentspaceDetail.json";
import studentAssignment from "./student/studentAssignment.json";
import studentSubmission from "./student/studentSubmission.json";
import studentDashboard from "./student/dashboard.json";
import studentDashboardIntro from "./student/dashboardIntro.json";
import studentBoard from "./student/studentBoard.json";

import parentParentSpaces from "./parent/parentSpaces.json";
import parentParentSpaceDetail from "./parent/parentSpaceDetail.json";
import parentParentAssignmentDetail from "./parent/parentAssignmentDetail.json";
import parentParentNewSpace from "./parent/parentNewSpace.json";
import dashboardPage from "./parent/dashboardPage.json";

import teacherSpaces from "./teacher/spaces.json";
import teacherSpacesNew from "./teacher/spacesNew.json";
import teacherSpaceDetail from "./teacher/spaceDetail.json";
import teacherAssignedTask from "./teacher/assignedTask.json";
import teacherSubmission from "./teacher/submission.json";
import teacherBoard from "./teacher/teacherBoard.json";
import teacherMembers from "./teacher/teacherMembers.json";
import teacherPage from "./teacher/teacherPage.json";

import producerGenerateNewText from "./producer/generateNewText.json";
import producerEditorNewText from "./producer/editorNewText.json";
import producerLessonPrint from "./producer/lessonPrint.json";
import producerReadingTestsNew from "./producer/readingTestsNew.json";
import producerReadingTestsEditor from "./producer/readingTestsEditor.json";

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends JsonObject, U extends JsonObject>(base: T, override: U): T & U {
  const result: JsonObject = { ...base };

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = result[key];

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = deepMerge(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }

  return result as T & U;
}

const nbMessages = {
  ...common,
  ...nav,
  ...topNav,
  ...modes,
  ...actions,
  ...status,
  ...brandLogo,
  ...library,
  ...join,
  ...unauthorized,
  ...landing,
  ...lessonsLanding,
  ...readingTestPlayer,
  ...libraryLanding,
  ...content,
  ...accountBilling,
  ...pricing,
  ...postLogin,
  ...libraryOpenLesson,

  ...authLogin,
  ...authOnboarding,

  ...mathMathGeometry,
  ...mathMathGeometryPrint,

  ...toolsToolsIndex,
  ...toolsTextGeneratorFree,
  ...toolsSentenceFixerFree,
  ...toolsSpeakingTopicFree,
  ...toolsTranslateFree,
  ...toolsVocabFree,

  ...studentSpaces,
  ...studentSpaceDetail,
  ...studentAssignment,
  ...studentSubmission,
  ...studentDashboard,
  ...studentDashboardIntro,
  ...studentBoard,

  ...parentParentSpaces,
  ...parentParentSpaceDetail,
  ...parentParentAssignmentDetail,
  ...parentParentNewSpace,
  ...dashboardPage,

  ...teacherSpaces,
  ...teacherSpacesNew,
  ...teacherSpaceDetail,
  ...teacherAssignedTask,
  ...teacherSubmission,
  ...teacherBoard,
  ...teacherMembers,
  ...teacherPage,

  ...producerGenerateNewText,
  ...producerEditorNewText,
  ...producerLessonPrint,
  ...producerReadingTestsNew,
  ...producerReadingTestsEditor,
};

const messages = deepMerge(en, nbMessages);

export default messages;