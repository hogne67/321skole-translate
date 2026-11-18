import { getAuth } from "firebase/auth";
export async function speechHeaders() {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Logg inn for å bruke lyd.");
  const token = await user.getIdToken();
  if (getAuth().currentUser !== user) throw new Error("Logg inn på nytt for å bruke lyd.");
  return { "Content-Type":"application/json", Authorization:`Bearer ${token}` };
}
