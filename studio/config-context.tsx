import { createContext, type ReactNode, useContext } from "react";
import { useClient } from "sanity";
import type { ResolvedR2VideoConfig } from "./defaults";

const R2VideoConfigContext = createContext<ResolvedR2VideoConfig | null>(null);

type ProviderProps = {
	config: ResolvedR2VideoConfig;
	children: ReactNode;
};

export const R2VideoConfigProvider = ({ config, children }: ProviderProps) => {
	return (
		<R2VideoConfigContext.Provider value={config}>
			{children}
		</R2VideoConfigContext.Provider>
	);
};

export const useR2VideoConfig = () => {
	const config = useContext(R2VideoConfigContext);
	if (!config) {
		throw new Error(
			"Missing R2 video config. Add `r2Video` to the Studio's plugin list.",
		);
	}

	return config;
};

/** The config, and a client on the API version it names. */
export const useR2VideoClient = () => {
	const config = useR2VideoConfig();
	const client = useClient({ apiVersion: config.apiVersion });
	return { config, client };
};
