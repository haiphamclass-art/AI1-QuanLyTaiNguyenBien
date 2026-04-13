import { useTranslation } from 'react-i18next';
import './LanguageSwitch.css';

const LanguageSwitch = () => {
  const { i18n } = useTranslation();
  const isEnglish = i18n.language === 'en';

  const toggleLanguage = () => {
    i18n.changeLanguage(isEnglish ? 'vn' : 'en');
  };

  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={isEnglish}
        onChange={toggleLanguage}
      />
      <span className="slider round"></span>
    </label>
  );
};

export default LanguageSwitch;
