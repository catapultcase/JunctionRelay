import { useEffect } from 'react';

/**
 * Custom hook to set the page title
 * @param title - The title to set (will be prefixed with "JunctionRelay - ")
 */
export const usePageTitle = (title: string) => {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = title ? `JunctionRelay - ${title}` : 'JunctionRelay';

        // Cleanup: restore previous title when component unmounts
        return () => {
            document.title = previousTitle;
        };
    }, [title]);
};
