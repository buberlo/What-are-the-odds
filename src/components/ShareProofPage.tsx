import SharePage from "./SharePage";
import { SharePayload } from "../types";

interface ShareProofPageProps {
  id: string;
  initialData?: SharePayload;
}

const ShareProofPage = ({ id, initialData }: ShareProofPageProps) => (
  <SharePage resource="proof" id={id} initialData={initialData} />
);

export default ShareProofPage;
