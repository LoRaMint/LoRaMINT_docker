import Layout from "../../components/layout/Layout";

const ImpressumPage = () => {
  return (
    <Layout>
      <h1 class="text-2xl font-bold border-b border-base-300 pb-2 mb-6 mt-8">
        Impressum
      </h1>
      <div class="whitespace-pre-wrap leading-relaxed text-base">
        {Bun.env.LEGAL_IMPRESSUM}
      </div>
    </Layout>
  );
};

export default ImpressumPage;
