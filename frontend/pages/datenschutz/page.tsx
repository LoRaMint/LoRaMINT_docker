import Layout from "../../components/layout/Layout";

const DatenschutzPage = () => {
  return (
    <Layout>
      <h1 class="text-2xl font-bold border-b border-base-300 pb-2 mb-6 mt-8">
        Datenschutz
      </h1>
      <div class="whitespace-pre-wrap leading-relaxed text-base">
        {Bun.env.LEGAL_DATENSCHUTZ}
      </div>
    </Layout>
  );
};

export default DatenschutzPage;
