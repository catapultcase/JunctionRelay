import { useEffect } from 'react';

/**
 * Custom hook to set the page title
 * @param title - The title to set (will be prefixed with "JR Server - ")
 */
export const usePageTitle = (title: string) => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = title ? `JR Server - ${title}` : 'JR Server';

        // Cleanup: restore previous title when component unmounts
        return () => {
            document.title = previousTitle;
        };
    }, [title]);
};
