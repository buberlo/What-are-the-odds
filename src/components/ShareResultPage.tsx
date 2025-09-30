import SharePage from "./SharePage";
import { SharePayload } from "../types";

interface ShareResultPageProps {
  id: string;
  initialData?: SharePayload;
}

const ShareResultPage = ({ id, initialData }: ShareResultPageProps) => (
  <SharePage resource="result" id={id} initialData={initialData} />
);

export default ShareResultPage;
