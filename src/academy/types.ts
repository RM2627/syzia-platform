export type Lesson = {
  id: string;
  title: string;
  description: string;
  video_id: string;
  published: boolean;
  materials: string[];
};
export type Module = { id: string; title: string; lessons: Lesson[] };
export type CourseDocument = {
  title: string;
  description: string;
  audience: string;
  cover: string;
  modules: Module[];
};
export type Course = {
  id: string;
  revision: number;
  state: string;
  position: number;
  draft: CourseDocument;
  published?: CourseDocument;
  published_version?: string;
};
export type Material = {
  id: string;
  kind: "image" | "material";
  name: string;
  mime: string;
  bytes: number;
};
export type AcademyCall = (
  action: string,
  data?: Record<string, unknown>,
) => Promise<any>;
