// lib/userProfile.ts
export type UserProfile = {
  roles?: {
    student?: boolean;
    teacher?: boolean;
    admin?: boolean;
    parent?: boolean;
  };
  teacherStatus?: "none" | "pending" | "approved" | "rejected";
  caps?: {
    publish?: boolean;
    sell?: boolean;
    pdf?: boolean;
    tts?: boolean;
    vocab?: boolean;
  };
  parentOf?: string[];
  createdAt?: any;
  updatedAt?: any;
};

