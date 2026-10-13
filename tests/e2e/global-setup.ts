import resetDatabase from "../support/global-setup";

export default async function setup() {
  await resetDatabase();
}
