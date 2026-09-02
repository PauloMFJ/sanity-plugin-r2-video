import { Box, Button, Card, Flex, Spinner, Stack, Text } from "@sanity/ui";
import type { ReactNode } from "react";

type NoticeProps = {
	tone: "caution" | "critical" | "positive";

	/** Bold line above the message. Omitted, the message stands alone. */
	title?: string;

	/** Shown beside the text, sized to match it. */
	icon?: ReactNode;
	children: ReactNode;
};

/** A toned message: an error, a warning, or a confirmation. */
export const Notice = ({ tone, title, icon, children }: NoticeProps) => {
	return (
		<Card padding={4} radius={2} tone={tone}>
			<Flex align="flex-start" gap={3}>
				{icon && <Text size={2}>{icon}</Text>}

				<Stack gap={3}>
					{title && (
						<Text size={1} weight="semibold">
							{title}
						</Text>
					)}
					{typeof children === "string" ? (
						<Text muted={Boolean(title)} size={1}>
							{children}
						</Text>
					) : (
						children
					)}
				</Stack>
			</Flex>
		</Card>
	);
};

type FieldProps = {
	label: string;

	/** Binds the label to its control. */
	id?: string;

	/** Hint under the control. */
	description?: string;
	children: ReactNode;
};

/** A label above its control, so inputs of different heights line up. */
export const Field = ({ label, id, description, children }: FieldProps) => {
	return (
		<Stack gap={3}>
			<Text as={id ? "label" : undefined} htmlFor={id} size={1} weight="medium">
				{label}
			</Text>
			{children}
			{description && (
				<Text muted size={0}>
					{description}
				</Text>
			)}
		</Stack>
	);
};

type ActionProps = {
	text: string;
	disabled?: boolean;
	onClick: () => void;
};

type DialogActionsProps = {
	/** Left-hand icon button, for a destructive secondary action. */
	aside?: ReactNode;

	cancel: ActionProps;

	/** The primary action. Omitted, cancel fills the row. */
	confirm?: ActionProps & { tone: "primary" | "critical" };
};

/** The footer every dialog here uses. */
export const DialogActions = ({
	aside,
	cancel,
	confirm,
}: DialogActionsProps) => {
	return (
		<Card borderTop padding={2}>
			<Flex gap={2}>
				{aside}

				<Box flex={1}>
					<Button
						disabled={cancel.disabled}
						mode="ghost"
						text={cancel.text}
						width="fill"
						onClick={cancel.onClick}
					/>
				</Box>

				{confirm && (
					<Box flex={1}>
						<Button
							disabled={confirm.disabled}
							text={confirm.text}
							tone={confirm.tone}
							width="fill"
							onClick={confirm.onClick}
						/>
					</Box>
				)}
			</Flex>
		</Card>
	);
};

/** A spinner and what it's waiting on. */
export const Loading = ({ children }: { children: ReactNode }) => {
	return (
		<Flex align="center" gap={3}>
			<Spinner muted />
			<Text muted size={1}>
				{children}
			</Text>
		</Flex>
	);
};
