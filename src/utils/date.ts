export const getLocalDateString = () => {
  const tarih = new Date();
  tarih.setMinutes(tarih.getMinutes() - tarih.getTimezoneOffset());
  return tarih.toISOString().split("T")[0];
};
